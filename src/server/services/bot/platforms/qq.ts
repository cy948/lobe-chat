import { LOADING_FLAT } from '@lobechat/const';
import type { ChatTopicBotContext } from '@lobechat/types';
import debug from 'debug';
import WebSocket from 'ws';

import { getServerDB } from '@/database/core/db-adaptor';
import { AgentBotProviderModel } from '@/database/models/agentBotProvider';
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
const MESSAGE_REPLY_LIMIT = 4;
const MESSAGE_REPLY_TTL_MS = 60 * 60 * 1000;
const MAX_REPLY_TRACKER_SIZE = 10_000;
const MAX_MSG_SEQ_TRACKER_SIZE = 10_000;
const MSG_SEQ_MAX = 65_535;
const INBOUND_QUEUE_MAX_SIZE = 1000;
const INBOUND_PER_THREAD_MAX_SIZE = 20;
const INBOUND_MAX_CONCURRENT_THREADS = 8;
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000, 60_000];
const RATE_LIMIT_RECONNECT_DELAY_MS = 60_000;

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

interface MessageReplyRecord {
  count: number;
  firstReplyAt: number;
}

interface InboundTask {
  eventId?: string;
  run: () => Promise<void>;
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
  private activeThreadCount = 0;
  private inboundQueues = new Map<string, InboundTask[]>();
  private processingThreads = new Set<string>();
  private stopped = false;
  private totalQueuedTasks = 0;
  private threadTopicMap = new Map<string, string>();
  private messageReplyTracker = new Map<string, MessageReplyRecord>();
  private messageSeqTracker = new Map<string, { firstReplyAt: number; seq: number }>();
  private resolvedAgentContext: { agentId: string; userId: string } | null = null;
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
    this.clearInboundQueues();
    this.closeSocket();

    const { appId, clientSecret } = this.resolveCredentials();
    if (!appId || !clientSecret) {
      throw new Error('QQ bot credentials are missing');
    }
    this.resolvedAgentContext = null;
    const { agentId, userId } = await this.resolveAgentContext();

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
    this.clearInboundQueues();
    this.messageSeqTracker.clear();
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

  private resetTokenCache() {
    this.cachedAccessToken = null;
    this.accessTokenExpiresAt = 0;
    this.tokenPromise = null;
  }

  private clearSessionState() {
    this.sessionId = null;
    this.seq = null;
  }

  private closeSocket() {
    this.clearHeartbeatTimer();

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

  private async resolveAgentContext(): Promise<{ agentId: string; userId: string }> {
    if (this.resolvedAgentContext) {
      return this.resolvedAgentContext;
    }

    const { agentId, userId } = this.config;
    if (agentId && userId) {
      this.resolvedAgentContext = { agentId, userId };
      return this.resolvedAgentContext;
    }

    const db = await getServerDB();
    const provider = await AgentBotProviderModel.findByPlatformAndAppId(
      db,
      this.platform,
      this.applicationId,
    );

    if (!provider?.agentId || !provider?.userId) {
      throw new Error('QQ bot context is missing agentId/userId');
    }

    this.resolvedAgentContext = { agentId: provider.agentId, userId: provider.userId };
    return this.resolvedAgentContext;
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

      if (this.stopped) return;

      // 4914/4915 indicate the bot is offline or banned; reconnect loops won't recover this.
      if (code === 4914 || code === 4915) {
        log('QQBot appId=%s fatal close code=%d, stop reconnecting', this.applicationId, code);
        return;
      }

      // Token is invalid. Clear cache and reconnect with a fresh token.
      if (code === 4004) {
        this.resetTokenCache();
        this.scheduleReconnect();
        return;
      }

      // Rate-limited by gateway. Back off with a fixed longer delay.
      if (code === 4008) {
        this.scheduleReconnect(RATE_LIMIT_RECONNECT_DELAY_MS);
        return;
      }

      // Session state is not resumable. Re-identify on next connect.
      if (code === 4006 || code === 4007 || code === 4009 || (code >= 4900 && code <= 4913)) {
        this.clearSessionState();
        this.scheduleReconnect();
        return;
      }

      this.scheduleReconnect();
    });

    ws.on('error', (error) => {
      log('QQBot appId=%s gateway error: %O', this.applicationId, error);
    });
  }

  private scheduleReconnect(customDelayMs?: number) {
    this.clearReconnectTimer();

    const index = Math.min(this.reconnectAttempts, RECONNECT_DELAYS_MS.length - 1);
    const delay = customDelayMs ?? RECONNECT_DELAYS_MS[index];
    this.reconnectAttempts += 1;

    log(
      'QQBot appId=%s scheduling reconnect #%d in %dms',
      this.applicationId,
      this.reconnectAttempts,
      delay,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
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
        this.clearSessionState();
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
        const event = data as QQC2CMessageCreateEvent;
        const openid = event.author?.user_openid || 'unknown';
        this.enqueueInboundTask(`qq:c2c:${openid}`, {
          eventId: event.id,
          run: async () => {
            await this.handleC2CMessage(event);
          },
        });
        return;
      }
      case 'GROUP_AT_MESSAGE_CREATE': {
        const event = data as QQGroupAtMessageCreateEvent;
        const groupOpenid = event.group_openid || 'unknown';
        this.enqueueInboundTask(`qq:group:${groupOpenid}`, {
          eventId: event.id,
          run: async () => {
            await this.handleGroupAtMessage(event);
          },
        });
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

  private enqueueInboundTask(threadId: string, task: InboundTask) {
    if (this.stopped) return;

    let queue = this.inboundQueues.get(threadId);
    if (!queue) {
      queue = [];
      this.inboundQueues.set(threadId, queue);
    }

    if (queue.length >= INBOUND_PER_THREAD_MAX_SIZE) {
      const dropped = queue.shift();
      this.totalQueuedTasks = Math.max(0, this.totalQueuedTasks - 1);
      log(
        'QQBot queue overflow per-thread thread=%s droppedEventId=%s',
        threadId,
        dropped?.eventId || '(unknown)',
      );
    }

    if (this.totalQueuedTasks >= INBOUND_QUEUE_MAX_SIZE) {
      log(
        'QQBot queue overflow global appId=%s thread=%s droppedIncomingEventId=%s queued=%d',
        this.applicationId,
        threadId,
        task.eventId || '(unknown)',
        this.totalQueuedTasks,
      );
      return;
    }

    queue.push(task);
    this.totalQueuedTasks += 1;
    this.drainInboundQueue(threadId);
  }

  private drainInboundQueue(threadId: string) {
    if (this.stopped) return;
    if (this.processingThreads.has(threadId)) return;
    if (this.activeThreadCount >= INBOUND_MAX_CONCURRENT_THREADS) return;

    const queue = this.inboundQueues.get(threadId);
    if (!queue || queue.length === 0) {
      this.inboundQueues.delete(threadId);
      return;
    }

    this.processingThreads.add(threadId);
    this.activeThreadCount += 1;

    void this.processInboundQueue(threadId);
  }

  private async processInboundQueue(threadId: string) {
    const queue = this.inboundQueues.get(threadId);

    try {
      while (!this.stopped && queue && queue.length > 0) {
        const task = queue.shift()!;
        this.totalQueuedTasks = Math.max(0, this.totalQueuedTasks - 1);

        try {
          await task.run();
        } catch (error) {
          log(
            'QQBot inbound task failed appId=%s thread=%s eventId=%s err=%O',
            this.applicationId,
            threadId,
            task.eventId || '(unknown)',
            error,
          );
        }
      }
    } finally {
      this.processingThreads.delete(threadId);
      this.activeThreadCount = Math.max(0, this.activeThreadCount - 1);

      if (!queue || queue.length === 0) {
        this.inboundQueues.delete(threadId);
      }

      this.wakeInboundQueues();
    }
  }

  private wakeInboundQueues() {
    if (this.stopped) return;

    for (const [threadId, queue] of this.inboundQueues) {
      if (this.activeThreadCount >= INBOUND_MAX_CONCURRENT_THREADS) break;
      if (queue.length === 0 || this.processingThreads.has(threadId)) continue;
      this.drainInboundQueue(threadId);
    }
  }

  private clearInboundQueues() {
    this.inboundQueues.clear();
    this.processingThreads.clear();
    this.activeThreadCount = 0;
    this.totalQueuedTasks = 0;
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
    const { agentId, userId } = await this.resolveAgentContext();

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

  private checkPassiveReplyLimit(replyToId?: string): {
    allowed: boolean;
    remaining: number;
    shouldFallbackToProactive: boolean;
  } {
    if (!replyToId) {
      return { allowed: false, remaining: 0, shouldFallbackToProactive: true };
    }

    const now = Date.now();

    if (this.messageReplyTracker.size > MAX_REPLY_TRACKER_SIZE) {
      for (const [id, rec] of this.messageReplyTracker) {
        if (now - rec.firstReplyAt > MESSAGE_REPLY_TTL_MS) {
          this.messageReplyTracker.delete(id);
        }
      }
    }

    const record = this.messageReplyTracker.get(replyToId);
    if (!record) {
      return {
        allowed: true,
        remaining: MESSAGE_REPLY_LIMIT,
        shouldFallbackToProactive: false,
      };
    }

    if (now - record.firstReplyAt > MESSAGE_REPLY_TTL_MS) {
      this.messageReplyTracker.delete(replyToId);
      return {
        allowed: true,
        remaining: MESSAGE_REPLY_LIMIT,
        shouldFallbackToProactive: false,
      };
    }

    const remaining = MESSAGE_REPLY_LIMIT - record.count;

    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      shouldFallbackToProactive: remaining <= 0,
    };
  }

  private recordPassiveReply(replyToId: string): void {
    const now = Date.now();
    const record = this.messageReplyTracker.get(replyToId);

    if (!record) {
      this.messageReplyTracker.set(replyToId, { count: 1, firstReplyAt: now });
      return;
    }

    if (now - record.firstReplyAt > MESSAGE_REPLY_TTL_MS) {
      this.messageReplyTracker.set(replyToId, { count: 1, firstReplyAt: now });
      return;
    }

    record.count += 1;
  }

  private getNextMsgSeq(replyToId?: string): number {
    if (!replyToId) {
      const timePart = Date.now() % 100_000_000;
      const random = Math.floor(Math.random() * (MSG_SEQ_MAX + 1));
      return (timePart ^ random) % (MSG_SEQ_MAX + 1);
    }

    const now = Date.now();

    if (this.messageSeqTracker.size > MAX_MSG_SEQ_TRACKER_SIZE) {
      for (const [id, rec] of this.messageSeqTracker) {
        if (now - rec.firstReplyAt > MESSAGE_REPLY_TTL_MS) {
          this.messageSeqTracker.delete(id);
        }
      }
    }

    const rec = this.messageSeqTracker.get(replyToId);
    if (!rec || now - rec.firstReplyAt > MESSAGE_REPLY_TTL_MS) {
      this.messageSeqTracker.set(replyToId, { firstReplyAt: now, seq: 1 });
      return 1;
    }

    const next = rec.seq >= MSG_SEQ_MAX ? 1 : rec.seq + 1;
    rec.seq = next;
    return next;
  }

  private async sendC2CMessage(openid: string, content: string, replyToId?: string) {
    const chunks = this.splitMessage(content);
    const limit = this.checkPassiveReplyLimit(replyToId);
    const passiveChunks = limit.allowed ? Math.min(chunks.length, limit.remaining) : 0;
    const proactiveChunks = chunks.length - passiveChunks;

    if (proactiveChunks > 0) {
      log(
        'QQBot C2C fallback to proactive openid=%s replyToId=%s passiveChunks=%d proactiveChunks=%d',
        openid,
        replyToId ?? '(none)',
        passiveChunks,
        proactiveChunks,
      );
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      if (i < passiveChunks && replyToId) {
        log(
          'QQBot C2C outgoing(passive) openid=%s msgId=%s chunk=%d/%d',
          openid,
          replyToId,
          i + 1,
          chunks.length,
        );
        await this.apiRequest('POST', `/v2/users/${openid}/messages`, {
          content: chunk,
          msg_id: replyToId,
          msg_seq: this.getNextMsgSeq(replyToId),
          msg_type: 0,
        });
        this.recordPassiveReply(replyToId);
        continue;
      }

      log('QQBot C2C outgoing(proactive) openid=%s chunk=%d/%d', openid, i + 1, chunks.length);
      await this.apiRequest('POST', `/v2/users/${openid}/messages`, {
        content: chunk,
        msg_seq: this.getNextMsgSeq(),
        msg_type: 0,
      });
    }
  }

  private async sendGroupMessage(groupOpenid: string, content: string, replyToId?: string) {
    const chunks = this.splitMessage(content);
    const limit = this.checkPassiveReplyLimit(replyToId);
    const passiveChunks = limit.allowed ? Math.min(chunks.length, limit.remaining) : 0;
    const proactiveChunks = chunks.length - passiveChunks;

    if (proactiveChunks > 0) {
      log(
        'QQBot GROUP fallback to proactive groupOpenid=%s replyToId=%s passiveChunks=%d proactiveChunks=%d',
        groupOpenid,
        replyToId ?? '(none)',
        passiveChunks,
        proactiveChunks,
      );
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      if (i < passiveChunks && replyToId) {
        log(
          'QQBot GROUP outgoing(passive) groupOpenid=%s msgId=%s chunk=%d/%d',
          groupOpenid,
          replyToId,
          i + 1,
          chunks.length,
        );
        await this.apiRequest('POST', `/v2/groups/${groupOpenid}/messages`, {
          content: chunk,
          msg_id: replyToId,
          msg_seq: this.getNextMsgSeq(replyToId),
          msg_type: 0,
        });
        this.recordPassiveReply(replyToId);
        continue;
      }

      log(
        'QQBot GROUP outgoing(proactive) groupOpenid=%s chunk=%d/%d',
        groupOpenid,
        i + 1,
        chunks.length,
      );
      await this.apiRequest('POST', `/v2/groups/${groupOpenid}/messages`, {
        content: chunk,
        msg_seq: this.getNextMsgSeq(),
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
