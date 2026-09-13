import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import os from 'node:os';

import WebSocket from 'ws';

import type {
  AgentRunAckMessage,
  AgentRunRequestMessage,
  ClientMessage,
  ConnectionStatus,
  GatewayClientEvents,
  MessageApiRequestMessage,
  MessageApiResponseMessage,
  RpcRequestMessage,
  RpcResponseMessage,
  ServerMessage,
  SystemInfoRequestMessage,
  SystemInfoResponseMessage,
  ToolCallRequestMessage,
  ToolCallResponseMessage,
} from './types';

// ─── Constants ───

const DEFAULT_GATEWAY_URL = 'https://device-gateway.lobehub.com';
const HEARTBEAT_INTERVAL = 30_000; // 30s
const INITIAL_RECONNECT_DELAY = 1000; // 1s
const MAX_RECONNECT_DELAY = 30_000; // 30s
const MAX_MISSED_HEARTBEATS = 3; // Force reconnect after 3 missed acks
const MAX_LOG_TEXT_LENGTH = 500;
/**
 * Budget for the whole pre-connected window: TCP + TLS + HTTP upgrade AND the
 * `auth_success` reply. Neither phase raises an event of its own when it simply
 * hangs, so without a deadline the client waits on the OS TCP timeout — observed
 * stalling a reconnect for 15+ minutes while the device sat offline.
 */
const CONNECT_TIMEOUT = 15_000; // 15s

interface SocketAttempt {
  authenticatedAt?: number;
  id: number;
  lastHeartbeatAckAt?: number;
  lastMessageAt?: number;
  openedAt?: number;
  socket: WebSocket;
  startedAt: number;
}

interface SocketListeners {
  close: (code: number, reason: Buffer) => void;
  error: (error: Error) => void;
  message: (data: WebSocket.Data) => void;
  open: () => void;
}

type SocketLogDetails = Record<string, boolean | number | string | null | undefined>;
type SocketLogLevel = 'debug' | 'error' | 'info' | 'warn';

const sanitizeLogText = (value: string) =>
  value.replaceAll(/[\r\n\t]+/g, ' ').slice(0, MAX_LOG_TEXT_LENGTH);

// ─── Logger Interface ───

export interface GatewayClientLogger {
  debug: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
}

const noopLogger: GatewayClientLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
};

export interface GatewayClientOptions {
  /** Auto-reconnect on disconnection (default: true) */
  autoReconnect?: boolean;
  /**
   * Freeform routing label for this connection, e.g. `desktop` / `desktop-dev`
   * / `cli` / `cli-dev`. Used by the gateway for dispatch priority + UI; it does
   * NOT participate in stale-connection dedupe (that's `connectionId`).
   */
  channel?: string;
  /**
   * Stable per-install random UUID identifying this connection. The gateway uses
   * it as the stale-connection dedupe key, so multiple channels on the same
   * physical device (same `deviceId`) coexist. Defaults to a fresh UUID, which
   * means a fresh dedupe identity per process — callers that want a reconnect to
   * replace its own previous socket should pass a persisted value.
   */
  connectionId?: string;
  /**
   * How long to wait for a connection to become fully authenticated before
   * abandoning it and retrying (default: 15s).
   */
  connectTimeoutMs?: number;
  deviceId?: string;
  gatewayUrl?: string;
  logger?: GatewayClientLogger;
  serverUrl?: string;
  token: string;
  tokenType?: 'apiKey' | 'jwt' | 'serviceToken';
  userAgent?: string;
  userId?: string;
  /**
   * When set, the connection enrolls as a WORKSPACE-owned device: the gateway
   * routes it to the `workspace:<id>` principal (reachable by all members)
   * instead of the signer's personal one. The connect token must carry a
   * matching `workspace_id` claim or the gateway rejects the socket.
   */
  workspaceId?: string;
}

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private socketAttempts = new WeakMap<WebSocket, SocketAttempt>();
  private socketListeners = new WeakMap<WebSocket, SocketListeners>();
  private nextSocketAttemptId = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private missedHeartbeats = 0;
  private status: ConnectionStatus = 'disconnected';
  private intentionalDisconnect = false;
  private deviceId: string;
  private connectionId: string;
  private channel?: string;
  private gatewayUrl: string;
  private token: string;
  private tokenType?: 'apiKey' | 'jwt' | 'serviceToken';
  private userAgent?: string;
  private userId?: string;
  private workspaceId?: string;
  private serverUrl?: string;
  private logger: GatewayClientLogger;
  private autoReconnect: boolean;
  private connectTimeoutMs: number;

  constructor(options: GatewayClientOptions) {
    super();
    this.token = options.token;
    this.tokenType = options.tokenType;
    this.userAgent = options.userAgent;
    this.gatewayUrl = options.gatewayUrl || DEFAULT_GATEWAY_URL;
    this.deviceId = options.deviceId || randomUUID();
    this.connectionId = options.connectionId || randomUUID();
    this.channel = options.channel;
    this.serverUrl = options.serverUrl;
    this.userId = options.userId;
    this.workspaceId = options.workspaceId;
    this.logger = options.logger || noopLogger;
    this.autoReconnect = options.autoReconnect ?? true;
    this.connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT;
  }

  // ─── Public API ───

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  get currentDeviceId(): string {
    return this.deviceId;
  }

  get currentConnectionId(): string {
    return this.connectionId;
  }

  override on<K extends keyof GatewayClientEvents>(
    event: K,
    listener: GatewayClientEvents[K],
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof GatewayClientEvents>(
    event: K,
    ...args: Parameters<GatewayClientEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Update the auth token used for (re)connections.
   * Call this after refreshing an expired JWT, then call `reconnect()`.
   */
  updateToken(token: string): void {
    this.token = token;
  }

  /**
   * Force a reconnect cycle: close the current WebSocket and establish a new connection.
   * Useful after calling `updateToken()` with a fresh JWT.
   */
  async reconnect(): Promise<void> {
    this.cleanup();
    this.intentionalDisconnect = false;
    this.reconnectDelay = INITIAL_RECONNECT_DELAY;
    this.doConnect();
  }

  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') {
      return;
    }
    this.intentionalDisconnect = false;
    this.doConnect();
  }

  async disconnect(): Promise<void> {
    // Explicit log so a permanent stop (e.g. the auth_failed path calls
    // disconnect()) is provable from logs instead of inferred from the
    // absence of later reconnect lines.
    this.logger.info('Intentional disconnect; auto-reconnect disabled');
    this.intentionalDisconnect = true;
    this.cleanup();
    this.setStatus('disconnected');
  }

  sendToolCallResponse(response: Omit<ToolCallResponseMessage, 'type'>): void {
    this.sendMessage({
      ...response,
      type: 'tool_call_response',
    });
  }

  sendMessageApiResponse(response: Omit<MessageApiResponseMessage, 'type'>): void {
    this.sendMessage({
      ...response,
      type: 'message_api_response',
    });
  }

  sendSystemInfoResponse(response: Omit<SystemInfoResponseMessage, 'type'>): void {
    this.sendMessage({
      ...response,
      type: 'system_info_response',
    });
  }

  sendRpcResponse(response: Omit<RpcResponseMessage, 'type'>): void {
    this.sendMessage({
      ...response,
      type: 'rpc_response',
    });
  }

  sendAgentRunAck(response: Omit<AgentRunAckMessage, 'type'>): void {
    this.sendMessage({
      ...response,
      type: 'agent_run_ack',
    });
  }

  // ─── Connection Logic ───

  private doConnect() {
    this.clearReconnectTimer();

    this.setStatus('connecting');

    try {
      const wsUrl = this.buildWsUrl();

      // `handshakeTimeout` bounds TCP+TLS+upgrade inside `ws` itself, which turns
      // a black-holed handshake into a normal error/close pair. The watchdog
      // below is the belt to that suspenders: it also covers the phase `ws`
      // knows nothing about — an opened socket whose `auth_success` never lands.
      const wsOptions = {
        handshakeTimeout: this.connectTimeoutMs,
        ...(this.userAgent ? { headers: { 'User-Agent': this.userAgent } } : {}),
      };
      const ws = new WebSocket(wsUrl, wsOptions);
      const attempt: SocketAttempt = {
        id: ++this.nextSocketAttemptId,
        socket: ws,
        startedAt: Date.now(),
      };
      const listeners: SocketListeners = {
        close: (code, reason) => this.handleClose(code, reason, attempt),
        error: (error) => this.handleError(error, attempt),
        message: (data) => this.handleMessage(data, attempt),
        open: () => this.handleOpen(attempt),
      };

      this.socketAttempts.set(ws, attempt);
      this.socketListeners.set(ws, listeners);
      this.ws = ws;
      ws.on('open', listeners.open);
      ws.on('message', listeners.message);
      ws.on('close', listeners.close);
      ws.on('error', listeners.error);
      this.logSocket('debug', 'connect_start', attempt, {
        gateway: new URL(wsUrl).origin,
        principal: this.workspaceId ? 'workspace' : this.userId ? 'personal' : 'unspecified',
      });
      this.startConnectWatchdog();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to create WebSocket:', msg);
      this.setStatus('disconnected');
      if (this.autoReconnect) {
        this.scheduleReconnect();
      } else {
        this.emit('disconnected');
      }
    }
  }

  private buildWsUrl(): string {
    const wsProtocol = this.gatewayUrl.startsWith('https') ? 'wss' : 'ws';
    const host = this.gatewayUrl.replace(/^https?:\/\//, '');
    const params = new URLSearchParams({
      connectionId: this.connectionId,
      deviceId: this.deviceId,
      hostname: os.hostname(),
      platform: process.platform,
    });

    if (this.channel) {
      params.set('channel', this.channel);
    }

    // Workspace device: route to the `workspace:<id>` principal. Otherwise the
    // personal path passes userId. (The DO re-validates the token's claim, so
    // the routing param alone grants nothing.)
    if (this.workspaceId) {
      params.set('workspaceId', this.workspaceId);
    } else if (this.userId) {
      params.set('userId', this.userId);
    }

    return `${wsProtocol}://${host}/ws?${params.toString()}`;
  }

  /**
   * Best-effort JWT `exp` readout for auth logs. Internal backoff/heartbeat
   * reconnects reuse `this.token`, so whether the token was already expired
   * at auth time is the deciding fact when diagnosing auth failures from
   * logs. Never logs the token itself.
   */
  private describeTokenExpiry(): string {
    try {
      const payload = JSON.parse(Buffer.from(this.token.split('.')[1], 'base64url').toString());
      if (typeof payload.exp !== 'number') return 'token exp: none';
      const expired = Date.now() >= payload.exp * 1000;
      return `token exp: ${new Date(payload.exp * 1000).toISOString()}${expired ? ' (EXPIRED)' : ''}`;
    } catch {
      return 'token exp: unparsable';
    }
  }

  // ─── WebSocket Event Handlers ───

  private handleOpen = (attempt = this.getCurrentSocketAttempt()) => {
    if (attempt) attempt.openedAt = Date.now();
    this.reconnectDelay = INITIAL_RECONNECT_DELAY;
    this.setStatus('authenticating');
    this.logSocket('info', 'open', attempt, {
      openAfterMs:
        attempt?.openedAt !== undefined ? attempt.openedAt - attempt.startedAt : undefined,
      tokenExpiry: this.describeTokenExpiry(),
    });

    // Send token as first message instead of in URL
    this.sendMessage({
      serverUrl: this.serverUrl,
      token: this.token,
      tokenType: this.tokenType,
      type: 'auth',
    });
  };

  private handleMessage = (data: WebSocket.Data, attempt = this.getCurrentSocketAttempt()) => {
    try {
      const message = JSON.parse(String(data)) as ServerMessage;
      const now = Date.now();
      if (attempt) attempt.lastMessageAt = now;

      switch (message.type) {
        case 'auth_success': {
          if (attempt) attempt.authenticatedAt = now;
          this.clearConnectWatchdog();
          this.setStatus('connected');
          this.startHeartbeat();
          this.logSocket('info', 'auth_success', attempt, {
            authAfterMs: attempt ? now - attempt.startedAt : undefined,
          });
          this.emit('connected');
          break;
        }

        case 'auth_failed': {
          const reason =
            typeof (message as { reason?: unknown }).reason === 'string'
              ? (message as { reason: string }).reason
              : 'Unknown reason';
          this.logSocket('error', 'auth_failed', attempt, { reason: sanitizeLogText(reason) });
          this.emit('auth_failed', reason);
          this.disconnect();
          break;
        }

        case 'heartbeat_ack': {
          if (attempt) attempt.lastHeartbeatAckAt = now;
          this.missedHeartbeats = 0;
          this.emit('heartbeat_ack');
          break;
        }

        case 'tool_call_request': {
          this.emit('tool_call_request', message as ToolCallRequestMessage);
          break;
        }

        case 'message_api_request': {
          this.emit('message_api_request', message as MessageApiRequestMessage);
          break;
        }

        case 'system_info_request': {
          this.emit('system_info_request', message as SystemInfoRequestMessage);
          break;
        }

        case 'rpc_request': {
          this.emit('rpc_request', message as RpcRequestMessage);
          break;
        }

        case 'agent_run_request': {
          this.emit('agent_run_request', message as AgentRunRequestMessage);
          break;
        }

        case 'auth_expired': {
          this.logSocket('warn', 'auth_expired', attempt);
          this.emit('auth_expired');
          break;
        }

        default: {
          this.logSocket('warn', 'unknown_message', attempt, {
            messageType: (message as { type?: string }).type,
          });
        }
      }
    } catch (error) {
      this.logSocket('error', 'message_parse_failed', attempt, {
        error: sanitizeLogText(error instanceof Error ? error.message : String(error)),
      });
    }
  };

  private handleClose = (
    code: number,
    reason: Buffer,
    attempt = this.getCurrentSocketAttempt(),
  ) => {
    const now = Date.now();
    this.logSocket('info', 'close', attempt, {
      code,
      connectedForMs:
        attempt?.authenticatedAt !== undefined ? now - attempt.authenticatedAt : undefined,
      intentional: this.intentionalDisconnect,
      lastHeartbeatAckAgeMs:
        attempt?.lastHeartbeatAckAt !== undefined ? now - attempt.lastHeartbeatAckAt : undefined,
      lastMessageAgeMs:
        attempt?.lastMessageAt !== undefined ? now - attempt.lastMessageAt : undefined,
      missedHeartbeats: this.missedHeartbeats,
      reason: sanitizeLogText(reason.toString()),
    });
    this.stopHeartbeat();
    // `handshakeTimeout` closes the socket on its own, so the watchdog must be
    // disarmed here or it would fire later and force a SECOND reconnect on top
    // of the one this close already scheduled.
    this.clearConnectWatchdog();
    this.ws = null;

    if (!this.intentionalDisconnect && this.autoReconnect) {
      this.setStatus('reconnecting');
      this.scheduleReconnect();
    } else {
      this.setStatus('disconnected');
      this.emit('disconnected');
    }
  };

  private handleError = (error: Error, attempt = this.getCurrentSocketAttempt()) => {
    this.logSocket('error', 'error', attempt, {
      error: sanitizeLogText(error.message),
      errorCode: 'code' in error ? String(error.code) : undefined,
      errorName: error.name,
    });
    this.emit('error', error);
  };

  // ─── Heartbeat ───

  private startHeartbeat() {
    this.stopHeartbeat();
    this.missedHeartbeats = 0;
    this.heartbeatTimer = setInterval(() => {
      this.missedHeartbeats++;
      if (this.missedHeartbeats > MAX_MISSED_HEARTBEATS) {
        this.forceReconnect(`Missed ${this.missedHeartbeats} heartbeat acks, forcing reconnect`);
        return;
      }
      this.sendMessage({ type: 'heartbeat' });
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─── Connect watchdog ───

  private startConnectWatchdog() {
    this.clearConnectWatchdog();
    this.connectWatchdogTimer = setTimeout(() => {
      this.connectWatchdogTimer = null;
      this.forceReconnect(
        `No authenticated connection within ${this.connectTimeoutMs}ms (status: ${this.status}), forcing reconnect`,
      );
    }, this.connectTimeoutMs);
  }

  private clearConnectWatchdog() {
    if (this.connectWatchdogTimer) {
      clearTimeout(this.connectWatchdogTimer);
      this.connectWatchdogTimer = null;
    }
  }

  /**
   * Abandon the current socket and drive the retry ourselves. `closeWebSocket`
   * detaches our listeners, so `handleClose` will NOT run — every forced path
   * has to schedule the next attempt itself or the client goes quiet for good.
   */
  private forceReconnect(reason: string) {
    const attempt = this.getCurrentSocketAttempt();
    this.logSocket('warn', 'force_reconnect', attempt, {
      missedHeartbeats: this.missedHeartbeats,
      reason: sanitizeLogText(reason),
    });
    this.closeWebSocket();
    this.stopHeartbeat();
    this.clearConnectWatchdog();

    if (this.autoReconnect) {
      this.setStatus('reconnecting');
      this.scheduleReconnect();
    } else {
      this.setStatus('disconnected');
      this.emit('disconnected');
    }
  }

  // ─── Reconnection (exponential backoff) ───

  private scheduleReconnect() {
    this.clearReconnectTimer();

    const delay = this.reconnectDelay;
    this.logger.info(`Scheduling reconnect in ${delay}ms`);
    this.emit('reconnecting', delay);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.logger.info('Attempting reconnect');
      this.doConnect();
    }, delay);

    // Exponential backoff: 1s → 2s → 4s → 8s → ... → 30s
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Status ───

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;

    this.status = status;
    this.emit('status_changed', status);
  }

  // ─── Helpers ───

  private sendMessage(data: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return;
    }

    this.logSocket('warn', 'send_skipped', this.getCurrentSocketAttempt(), {
      messageType: data.type,
      referenceId:
        'requestId' in data ? data.requestId : 'operationId' in data ? data.operationId : undefined,
      socketReadyState: this.ws?.readyState ?? null,
    });
  }

  private getCurrentSocketAttempt(): SocketAttempt | undefined {
    return this.ws ? this.socketAttempts.get(this.ws) : undefined;
  }

  private logSocket(
    level: SocketLogLevel,
    event: string,
    attempt?: SocketAttempt,
    details: SocketLogDetails = {},
  ) {
    this.logger[level](
      `[gateway-ws] ${JSON.stringify({
        attemptId: attempt?.id,
        channel: this.channel,
        connectionId: this.connectionId,
        current: attempt ? attempt.socket === this.ws : false,
        event,
        status: this.status,
        ...details,
      })}`,
    );
  }

  private closeWebSocket() {
    if (!this.ws) {
      return;
    }
    const ws = this.ws;
    const listeners = this.socketListeners.get(ws);
    const suppressCloseError = (error: Error) => {
      this.logger.debug(`Ignoring WebSocket error during close: ${error.message}`);
    };
    const cleanupCloseErrorSuppression = () => {
      ws.off('close', cleanupCloseErrorSuppression);
      ws.off('error', suppressCloseError);
    };

    // Remove only listeners registered by this client.
    // Keep a temporary error handler while closing to avoid unhandled
    // "WebSocket was closed before the connection was established" errors.
    if (listeners) {
      ws.off('open', listeners.open);
      ws.off('message', listeners.message);
      ws.off('close', listeners.close);
      ws.off('error', listeners.error);
      this.socketListeners.delete(ws);
    }
    ws.on('error', suppressCloseError);
    ws.once('close', cleanupCloseErrorSuppression);

    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, 'Client disconnect');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to close WebSocket gracefully: ${errorMsg}`);
    }

    this.ws = null;
  }

  private cleanup() {
    this.stopHeartbeat();
    this.clearReconnectTimer();
    this.clearConnectWatchdog();
    this.closeWebSocket();
  }
}
