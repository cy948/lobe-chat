import { beforeEach, describe, expect, it, vi } from 'vitest';

const queuePushMock = vi.fn();
const managerStartBotMock = vi.fn();

const manager = {
  isRunning: true,
  start: vi.fn(),
  startBot: managerStartBotMock,
  stop: vi.fn(),
  stopBot: vi.fn(),
};

vi.mock('../bot/platforms', () => ({
  platformBotRegistry: {},
}));

vi.mock('./botConnectQueue', () => ({
  BotConnectQueue: vi.fn().mockImplementation(() => ({
    push: queuePushMock,
  })),
}));

vi.mock('./GatewayManager', () => ({
  createGatewayManager: vi.fn(() => manager),
  getGatewayManager: vi.fn(() => manager),
}));

describe('GatewayService startBot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    manager.isRunning = true;
  });

  it('queues only discord on Vercel', async () => {
    process.env.VERCEL = '1';
    const { GatewayService } = await import('./index');

    const service = new GatewayService();
    const status = await service.startBot('discord', 'app-discord', 'user-1');

    expect(status).toBe('queued');
    expect(queuePushMock).toHaveBeenCalledWith('discord', 'app-discord', 'user-1');
    expect(managerStartBotMock).not.toHaveBeenCalled();
  });

  it('starts qq directly on Vercel', async () => {
    process.env.VERCEL = '1';
    const { GatewayService } = await import('./index');

    const service = new GatewayService();
    const status = await service.startBot('qq', 'app-qq', 'user-1');

    expect(status).toBe('started');
    expect(queuePushMock).not.toHaveBeenCalled();
    expect(managerStartBotMock).toHaveBeenCalledWith('qq', 'app-qq', 'user-1');
  });

  it('does not treat VERCEL_ENV alone as Vercel runtime', async () => {
    process.env.VERCEL_ENV = 'production';
    const { GatewayService } = await import('./index');

    const service = new GatewayService();
    const status = await service.startBot('discord', 'app-discord', 'user-1');

    expect(status).toBe('started');
    expect(queuePushMock).not.toHaveBeenCalled();
    expect(managerStartBotMock).toHaveBeenCalledWith('discord', 'app-discord', 'user-1');
  });
});
