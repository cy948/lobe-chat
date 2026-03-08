import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(),
}));

vi.mock('@/database/models/agentBotProvider', () => ({
  AgentBotProviderModel: {
    findByPlatformAndAppId: vi.fn(),
  },
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn(),
}));

vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn(),
}));

const { QQ } = await import('../platforms/qq');

const createBot = (config: Record<string, string | undefined> = {}) =>
  new QQ({
    appId: 'app-id',
    clientSecret: 'client-secret',
    ...config,
  });

describe('QQ platform bot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('constructor and config', () => {
    it('should prefer applicationId over appId', () => {
      const bot = createBot({ appId: 'fallback-app-id', applicationId: 'primary-app-id' });

      expect(bot.applicationId).toBe('primary-app-id');
    });

    it('should resolve credentials from appId + botToken fallback', () => {
      const bot = createBot({ appId: 'qq-app', botToken: 'bot-secret', clientSecret: undefined });

      const credentials = (bot as any).resolveCredentials();

      expect(credentials).toEqual({
        appId: 'qq-app',
        clientSecret: 'bot-secret',
      });
    });

    it('should throw when start called without credentials', async () => {
      const bot = new QQ({});

      await expect(bot.start()).rejects.toThrow('QQ bot credentials are missing');
    });
  });

  describe('message parsing and chunking', () => {
    it('should normalize incoming text and strip group mentions', () => {
      const bot = createBot();

      expect((bot as any).normalizeIncomingText('  hello world  ')).toBe('hello world');
      expect((bot as any).normalizeIncomingText(' <@123> <@!456>  你好 QQ  ', true)).toBe(
        '你好 QQ',
      );
    });

    it('should split long messages by QQ max length and handle empty responses', () => {
      const bot = createBot();
      const longText = `${'a'.repeat(1600)}${'b'.repeat(7)}`;

      expect((bot as any).splitMessage('   ')).toEqual(['(empty response)']);

      const chunks = (bot as any).splitMessage(longText);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toHaveLength(1600);
      expect(chunks[1]).toBe('b'.repeat(7));
    });
  });

  describe('passive reply limit', () => {
    it('should enforce 4 passive replies per message id', () => {
      const bot = createBot();

      expect((bot as any).checkPassiveReplyLimit()).toEqual({
        allowed: false,
        remaining: 0,
        shouldFallbackToProactive: true,
      });

      expect((bot as any).checkPassiveReplyLimit('msg-1')).toMatchObject({
        allowed: true,
        remaining: 4,
      });

      for (let i = 0; i < 4; i++) {
        (bot as any).recordPassiveReply('msg-1');
      }

      expect((bot as any).checkPassiveReplyLimit('msg-1')).toEqual({
        allowed: false,
        remaining: 0,
        shouldFallbackToProactive: true,
      });
    });

    it('should reset passive reply window after ttl', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      const bot = createBot();
      (bot as any).recordPassiveReply('msg-1');

      vi.setSystemTime(new Date('2026-01-01T01:00:01.000Z'));

      expect((bot as any).checkPassiveReplyLimit('msg-1')).toMatchObject({
        allowed: true,
        remaining: 4,
        shouldFallbackToProactive: false,
      });
    });
  });

  describe('message sequence', () => {
    it('should increment sequence for same reply id and wrap at max', () => {
      const bot = createBot();

      expect((bot as any).getNextMsgSeq('reply-1')).toBe(1);
      expect((bot as any).getNextMsgSeq('reply-1')).toBe(2);

      (bot as any).messageSeqTracker.set('reply-wrap', { firstReplyAt: Date.now(), seq: 65_535 });
      expect((bot as any).getNextMsgSeq('reply-wrap')).toBe(1);
    });
  });

  describe('send message behavior', () => {
    it('should send passive first then proactive for C2C when reply limit exceeded', async () => {
      const bot = createBot();
      vi.spyOn(bot as any, 'splitMessage').mockReturnValue(['1', '2', '3', '4', '5']);
      const apiRequest = vi.spyOn(bot as any, 'apiRequest').mockResolvedValue({});

      await (bot as any).sendC2CMessage('user-openid', 'ignored', 'source-msg');

      expect(apiRequest).toHaveBeenCalledTimes(5);
      expect(apiRequest.mock.calls[0][1]).toBe('/v2/users/user-openid/messages');
      expect(apiRequest.mock.calls[0][2]).toMatchObject({
        content: '1',
        msg_id: 'source-msg',
        msg_type: 0,
      });
      expect(apiRequest.mock.calls[3][2]).toMatchObject({
        content: '4',
        msg_id: 'source-msg',
        msg_type: 0,
      });
      expect(apiRequest.mock.calls[4][2]).toMatchObject({
        content: '5',
        msg_type: 0,
      });
      expect(apiRequest.mock.calls[4][2]).not.toHaveProperty('msg_id');
    });

    it('should send proactive messages for groups when there is no replyToId', async () => {
      const bot = createBot();
      vi.spyOn(bot as any, 'splitMessage').mockReturnValue(['group-1', 'group-2']);
      const apiRequest = vi.spyOn(bot as any, 'apiRequest').mockResolvedValue({});

      await (bot as any).sendGroupMessage('group-openid', 'ignored');

      expect(apiRequest).toHaveBeenCalledTimes(2);
      expect(apiRequest.mock.calls[0][1]).toBe('/v2/groups/group-openid/messages');
      expect(apiRequest.mock.calls[0][2]).toMatchObject({ content: 'group-1', msg_type: 0 });
      expect(apiRequest.mock.calls[0][2]).not.toHaveProperty('msg_id');
    });
  });

  describe('api request', () => {
    it('should retry once with refreshed token on 401', async () => {
      const bot = createBot();
      vi.spyOn(bot as any, 'getAccessToken')
        .mockResolvedValueOnce('token-old')
        .mockResolvedValueOnce('token-new');

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'expired' })),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: vi.fn().mockResolvedValue(JSON.stringify({ url: 'wss://gateway.qq.com' })),
        });

      vi.stubGlobal('fetch', fetchMock);

      const result = await (bot as any).apiRequest('GET', '/gateway');

      expect(result).toEqual({ url: 'wss://gateway.qq.com' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][1]?.headers?.Authorization).toBe('QQBot token-old');
      expect(fetchMock.mock.calls[1][1]?.headers?.Authorization).toBe('QQBot token-new');
    });

    it('should throw formatted error when request fails without retry', async () => {
      const bot = createBot();
      vi.spyOn(bot as any, 'getAccessToken').mockResolvedValue('token-stable');

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('internal error'),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        (bot as any).apiRequest('POST', '/v2/users/user-openid/messages', { content: 'hi' }, false),
      ).rejects.toThrow(
        'QQ API request failed: POST /v2/users/user-openid/messages, status=500, body="internal error"',
      );
    });
  });
});
