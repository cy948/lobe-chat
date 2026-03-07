import { LOADING_FLAT } from '@lobechat/const';
import type { ChatTopicBotContext } from '@lobechat/types';
import debug from 'debug';
import WebSocket from 'ws';

import { getServerDB } from '@/database/core/db-adaptor';
import { MessageModel } from '@/database/models/message';
import { AiAgentService } from '@/server/services/aiAgent';

import type { PlatformBot } from '../types';

const log = debug('lobe-server:bot:gateway:qq');

const QQ_API_BASE = 'https://api.sgroup.qq.com';
const QQ_TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';
const QQ_INTENTS = 1 << 25; // GROUP_AND_C2C
const TOKEN_REFRESH_AHEAD_MS = 5 * 60 * 1000;
const MIN_REFRESH_INTERVAL_MS = 60 * 1000;
const AGENT_POLL_INTERVAL_MS = 1200;
const AGENT_POLL_TIMEOUT_MS = 5 * 60 * 1000;
const MESSAGE_MAX_LENGTH = 1600;
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000, 60_000];

interface QQTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface QQGatewayResponse {
  url?: string;
}

interface QQGatewayPayload {
  d?: any;
  op: number;
  s?: number;
  t?: string;
}

interface QQC2CMessageCreateEvent {
  author?: {
    user_openid?: string;
  };
  content?: string;
  id: string;
}

interface QQGroupAtMessageCreateEvent {
  content?: string;
  group_openid?: string;
  id: string;
}

export interface QQBotConfig {
  [key: string]: string | undefined;
  agentId?: string;
  appId?: string;
  applicationId?: string;
  botToken?: string;
  clientSecret?: string;
  userId?: string;
}

export class QQ implements PlatformBot {
  readonly platform = 'qq';
  readonly applicationId: string;

  private accessTokenExpiresAt = 0;
  private cachedAccessToken: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private seq: number | null = null;
  private sessionId: string | null = null;
  private stopped = false;
  private threadTopicMap = new Map<string, string>();
  private tokenPromise: Promise<string> | null = null;
  private ws: WebSocket | null = null;

  constructor(private config: QQBotConfig) {
    this.applicationId = config.applicationId || config.appId || '';
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();
    this.clearRefreshTimer();
    this.closeSocket();

    const { appId, clientSecret } = this.resolveCredentials();
    const { agentId, userId } = this.resolveAgentContext();

    if (!appId || !clientSecret) {
      throw new Error('QQ bot credentials are missing');
    }
    if (!agentId || !userId) {
      throw new Error('QQ bot context is missing agentId/userId');
    }

    log('Starting QQBot appId=%s agentId=%s userId=%s', appId, agentId, userId);

    await this.getAccessToken();
    await this.connectGateway();

    log('QQBot appId=%s started', appId);
  }

  async stop(): Promise<void> {
    log('Stopping QQBot appId=%s', this.applicationId);
    this.stopped = true;
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();
    this.clearRefreshTimer();
    this.closeSocket();
  }

  private clearRefreshTimer() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearHeartbeatTimer() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private closeSocket() {
    if (!this.ws) return;
    try {
      this.ws.removeAllListeners();
      this.ws.close();
    } catch (error) {
      log('closeSocket failed: %O', error);
    } finally {
      this.ws = null;
    }
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    const { appId, clientSecret } = this.resolveCredentials();
    if (!appId || !clientSecret) {
      throw new Error('QQ bot credentials are missing');
    }

    if (
      !forceRefresh &&
      this.cachedAccessToken &&
      Date.now() < this.accessTokenExpiresAt - TOKEN_REFRESH_AHEAD_MS
    ) {
      return this.cachedAccessToken;
    }

    if (!forceRefresh && this.tokenPromise) {
      return this.tokenPromise;
    }

    this.tokenPromise = this.fetchAccessToken(appId, clientSecret)
      .then(({ expiresInSec, token }) => {
        this.cachedAccessToken = token;
        this.accessTokenExpiresAt = Date.now() + expiresInSec * 1000;
        this.scheduleTokenRefresh(expiresInSec);
        return token;
      })
      .finally(() => {
        this.tokenPromise = null;
      });

    return this.tokenPromise;
  }

  private async fetchAccessToken(appId: string, clientSecret: string) {
    const response = await fetch(QQ_TOKEN_URL, {
      body: JSON.stringify({ appId, clientSecret }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const data = (await response.json()) as QQTokenResponse;

    if (!response.ok || !data.access_token) {
      throw new Error(
        `QQ access token request failed: status=${response.status}, body=${JSON.stringify(data)}`,
      );
    }

    return { expiresInSec: data.expires_in ?? 7200, token: data.access_token };
  }

  private resolveAgentContext(): { agentId?: string; userId?: string } {
    return {
      agentId: this.config.agentId,
      userId: this.config.userId,
    };
  }

  private resolveCredentials(): { appId: string; clientSecret: string } {
    const appId = this.config.applicationId || this.config.appId || '';
    const clientSecret = this.config.clientSecret || this.config.botToken || '';

    return { appId, clientSecret };
  }

  private scheduleTokenRefresh(expiresInSec: number) {
    this.clearRefreshTimer();

    const refreshInMs = Math.max(
      expiresInSec * 1000 - TOKEN_REFRESH_AHEAD_MS,
      MIN_REFRESH_INTERVAL_MS,
    );

    this.refreshTimer = setTimeout(() => {
      if (this.stopped) return;

      this.getAccessToken(true)
        .then(() => {
          log('QQBot appId=%s refreshed access token', this.applicationId);
        })
        .catch((error) => {
          log('QQBot appId=%s token refresh failed: %O', this.applicationId, error);
          this.refreshTimer = setTimeout(() => {
            if (this.stopped) return;
            void this.getAccessToken(true).catch((err) => {
              log('QQBot appId=%s quick token refresh retry failed: %O', this.applicationId, err);
            });
          }, MIN_REFRESH_INTERVAL_MS);
        });
    }, refreshInMs);
  }

  private async connectGateway(): Promise<void> {
    const gatewayUrl = await this.getGatewayUrl();
    const ws = new WebSocket(gatewayUrl);
    this.ws = ws;

    ws.on('open', () => {
      log('QQBot appId=%s gateway connected', this.applicationId);
    });

    ws.on('message', (buffer) => {
      const raw = typeof buffer === 'string' ? buffer : buffer.toString();
      void this.handleGatewayMessage(raw).catch((error) => {
        log('QQBot appId=%s gateway message handling failed: %O', this.applicationId, error);
      });
    });

    ws.on('close', (code, reason) => {
      const reasonText = typeof reason === 'string' ? reason : reason.toString();
      log('QQBot appId=%s gateway closed code=%d reason=%s', this.applicationId, code, reasonText);
      this.ws = null;
      this.clearHeartbeatTimer();

      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });

    ws.on('error', (error) => {
      log('QQBot appId=%s gateway error: %O', this.applicationId, error);
    });
  }

  private scheduleReconnect() {
    this.clearReconnectTimer();

    const index = Math.min(this.reconnectAttempts, RECONNECT_DELAYS_MS.length - 1);
    const delay = RECONNECT_DELAYS_MS[index];
    this.reconnectAttempts += 1;

    log(
      'QQBot appId=%s scheduling reconnect #%d in %dms',
      this.applicationId,
      this.reconnectAttempts,
      delay,
    );

    this.reconnectTimer = setTimeout(() => {
      if (this.stopped) return;
      void this.connectGateway().catch((error) => {
        log('QQBot appId=%s reconnect failed: %O', this.applicationId, error);
        this.scheduleReconnect();
      });
    }, delay);
  }

  private async getGatewayUrl(): Promise<string> {
    const data = await this.apiRequest<QQGatewayResponse>('GET', '/gateway');
    if (!data.url) {
      throw new Error(`QQ gateway url is missing, body=${JSON.stringify(data)}`);
    }
    return data.url;
  }

  private async handleGatewayMessage(raw: string) {
    const payload = JSON.parse(raw) as QQGatewayPayload;
    const { d, op, s, t } = payload;

    if (typeof s === 'number') {
      this.seq = s;
    }

    switch (op) {
      case 10: {
        await this.handleHello(d);
        return;
      }
      case 0: {
        await this.handleDispatch(t, d);
        return;
      }
      case 7: {
        log('QQBot appId=%s server requested reconnect', this.applicationId);
        this.closeSocket();
        this.scheduleReconnect();
        return;
      }
      case 9: {
        log(
          'QQBot appId=%s invalid session, resetting session and reconnecting',
          this.applicationId,
        );
        this.sessionId = null;
        this.seq = null;
        this.closeSocket();
        this.scheduleReconnect();
        return;
      }
      case 11: {
        return;
      }
      default: {
        log('QQBot appId=%s unsupported op=%s t=%s', this.applicationId, op, t);
      }
    }
  }

  private async handleHello(data?: any) {
    const interval = Number(data?.heartbeat_interval || 0);
    if (!interval) {
      throw new Error('QQ gateway hello payload missing heartbeat interval');
    }

    this.clearHeartbeatTimer();
    this.heartbeatTimer = setInterval(() => {
      this.sendGatewayPayload({ d: this.seq, op: 1 });
    }, interval);

    const accessToken = await this.getAccessToken();

    if (this.sessionId && typeof this.seq === 'number') {
      this.sendGatewayPayload({
        d: {
          seq: this.seq,
          session_id: this.sessionId,
          token: `QQBot ${accessToken}`,
        },
        op: 6,
      });
      return;
    }

    this.sendGatewayPayload({
      d: {
        intents: QQ_INTENTS,
        shard: [0, 1],
        token: `QQBot ${accessToken}`,
      },
      op: 2,
    });
  }

  private async handleDispatch(type?: string, data?: any) {
    switch (type) {
      case 'READY': {
        this.sessionId = data?.session_id ?? null;
        this.reconnectAttempts = 0;
        log('QQBot appId=%s READY sessionId=%s', this.applicationId, this.sessionId);
        return;
      }
      case 'RESUMED': {
        this.reconnectAttempts = 0;
        log('QQBot appId=%s RESUMED', this.applicationId);
        return;
      }
      case 'C2C_MESSAGE_CREATE': {
        await this.handleC2CMessage(data as QQC2CMessageCreateEvent);
        return;
      }
      case 'GROUP_AT_MESSAGE_CREATE': {
        await this.handleGroupAtMessage(data as QQGroupAtMessageCreateEvent);
        return;
      }
      default: {
        return;
      }
    }
  }

  private sendGatewayPayload(payload: Record<string, any>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private async handleC2CMessage(event: QQC2CMessageCreateEvent) {
    const openid = event.author?.user_openid;
    const incomingText = this.normalizeIncomingText(event.content);
    if (!openid || !incomingText) return;

    log('QQBot C2C incoming openid=%s msgId=%s text=%s', openid, event.id, incomingText);

    const platformThreadId = `qq:c2c:${openid}`;

    try {
      const reply = await this.executeAgent(platformThreadId, incomingText);
      await this.sendC2CMessage(openid, reply, event.id);
    } catch (error) {
      log('QQBot C2C message handling failed: %O', error);
      await this.sendC2CMessage(openid, '处理消息时出现异常，请稍后重试。', event.id).catch(
        (err) => {
          log('QQBot C2C fallback reply failed: %O', err);
        },
      );
    }
  }

  private async handleGroupAtMessage(event: QQGroupAtMessageCreateEvent) {
    const groupOpenid = event.group_openid;
    const incomingText = this.normalizeIncomingText(event.content, true);
    if (!groupOpenid || !incomingText) return;

    log(
      'QQBot GROUP incoming groupOpenid=%s msgId=%s text=%s',
      groupOpenid,
      event.id,
      incomingText,
    );

    const platformThreadId = `qq:group:${groupOpenid}`;

    try {
      const reply = await this.executeAgent(platformThreadId, incomingText);
      await this.sendGroupMessage(groupOpenid, reply, event.id);
    } catch (error) {
      log('QQBot group @message handling failed: %O', error);
      await this.sendGroupMessage(groupOpenid, '处理消息时出现异常，请稍后重试。', event.id).catch(
        (err) => {
          log('QQBot group fallback reply failed: %O', err);
        },
      );
    }
  }

  private normalizeIncomingText(content?: string, stripMention = false): string {
    if (!content) return '';

    let text = content.trim();
    if (stripMention) {
      text = text.replaceAll(/<@!?\d+>\s*/g, '').trim();
    }
    return text;
  }

  private async executeAgent(platformThreadId: string, prompt: string): Promise<string> {
    const { agentId, userId } = this.resolveAgentContext();
    if (!agentId || !userId) {
      throw new Error('QQ bot context is missing agentId/userId');
    }

    const db = await getServerDB();
    const aiAgentService = new AiAgentService(db, userId);
    const topicId = this.threadTopicMap.get(platformThreadId);

    const botContext: ChatTopicBotContext = {
      applicationId: this.applicationId,
      platform: 'qq',
      platformThreadId,
    };

    const result = await aiAgentService.execAgent({
      agentId,
      appContext: topicId ? { topicId } : undefined,
      autoStart: true,
      botContext,
      prompt,
      stream: false,
      title: '',
      trigger: 'bot',
      userInterventionConfig: { approvalMode: 'headless' },
    });

    if (!result.success) {
      throw new Error(result.error || 'QQ bot agent execution failed');
    }

    this.threadTopicMap.set(platformThreadId, result.topicId);

    return this.waitForAssistantReply(db, userId, result.assistantMessageId);
  }

  private async waitForAssistantReply(
    db: Awaited<ReturnType<typeof getServerDB>>,
    userId: string,
    id: string,
  ) {
    const messageModel = new MessageModel(db, userId);
    const deadline = Date.now() + AGENT_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const message = await messageModel.findById(id);
      if (!message) {
        throw new Error(`QQ bot assistant message not found: ${id}`);
      }

      if (message.error) {
        throw new Error(this.extractMessageError(message.error));
      }

      const content = (message.content || '').trim();
      if (content && content !== LOADING_FLAT) {
        return content;
      }

      await sleep(AGENT_POLL_INTERVAL_MS);
    }

    throw new Error('QQ bot agent execution timed out');
  }

  private extractMessageError(error: unknown): string {
    if (!error) return 'Unknown agent error';
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error && 'message' in error) {
      return String((error as Record<string, any>).message);
    }
    return JSON.stringify(error);
  }

  private async sendC2CMessage(openid: string, content: string, msgId?: string) {
    const chunks = this.splitMessage(content);

    for (let i = 0; i < chunks.length; i++) {
      log('QQBot C2C outgoing openid=%s msgId=%s chunk=%d/%d', openid, msgId, i + 1, chunks.length);
      await this.apiRequest('POST', `/v2/users/${openid}/messages`, {
        content: chunks[i],
        msg_id: msgId,
        msg_seq: i + 1,
        msg_type: 0,
      });
    }
  }

  private async sendGroupMessage(groupOpenid: string, content: string, msgId?: string) {
    const chunks = this.splitMessage(content);

    for (let i = 0; i < chunks.length; i++) {
      log(
        'QQBot GROUP outgoing groupOpenid=%s msgId=%s chunk=%d/%d',
        groupOpenid,
        msgId,
        i + 1,
        chunks.length,
      );
      await this.apiRequest('POST', `/v2/groups/${groupOpenid}/messages`, {
        content: chunks[i],
        msg_id: msgId,
        msg_seq: i + 1,
        msg_type: 0,
      });
    }
  }

  private splitMessage(content: string): string[] {
    const normalized = content.trim();
    if (!normalized) return ['(empty response)'];
    if (normalized.length <= MESSAGE_MAX_LENGTH) return [normalized];

    const chunks: string[] = [];
    for (let i = 0; i < normalized.length; i += MESSAGE_MAX_LENGTH) {
      chunks.push(normalized.slice(i, i + MESSAGE_MAX_LENGTH));
    }

    return chunks;
  }

  private async apiRequest<T = any>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, any>,
    retryOnAuth = true,
  ): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(`${QQ_API_BASE}${path}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Authorization': `QQBot ${token}`,
        'Content-Type': 'application/json',
      },
      method,
    });

    const text = await response.text();
    let data: any = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      if (retryOnAuth && (response.status === 401 || response.status === 403)) {
        this.cachedAccessToken = null;
        this.accessTokenExpiresAt = 0;
        return this.apiRequest(method, path, body, false);
      }

      throw new Error(
        `QQ API request failed: ${method} ${path}, status=${response.status}, body=${JSON.stringify(data)}`,
      );
    }

    return data as T;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
