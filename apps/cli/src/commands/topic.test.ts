import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { log } from '../utils/logger';
import { registerTopicCommand } from './topic';

const { mockTrpcClient } = vi.hoisted(() => ({
  mockTrpcClient: {
    aiAgent: {
      listOnlineDevices: { query: vi.fn() },
    },
    topic: {
      batchDelete: { mutate: vi.fn() },
      createTopic: { mutate: vi.fn() },
      getTopics: { query: vi.fn() },
      recentTopics: { query: vi.fn() },
      removeTopic: { mutate: vi.fn() },
      searchTopics: { query: vi.fn() },
      updateTopic: { mutate: vi.fn() },
      updateTopicMetadata: { mutate: vi.fn() },
    },
  },
}));

const { loadSettings: mockLoadSettings } = vi.hoisted(() => ({
  loadSettings: vi.fn(),
}));

const { getTrpcClient: mockGetTrpcClient } = vi.hoisted(() => ({
  getTrpcClient: vi.fn(),
}));

vi.mock('../api/client', () => ({ getTrpcClient: mockGetTrpcClient }));
vi.mock('../settings', () => ({ loadSettings: mockLoadSettings }));
vi.mock('../utils/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  setVerbose: vi.fn(),
}));

describe('topic command', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetTrpcClient.mockResolvedValue(mockTrpcClient);
    mockLoadSettings.mockReturnValue(null);
    for (const method of Object.values(mockTrpcClient.aiAgent)) {
      for (const fn of Object.values(method)) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
    for (const method of Object.values(mockTrpcClient.topic)) {
      for (const fn of Object.values(method)) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  function createProgram() {
    const program = new Command();
    program.exitOverride();
    registerTopicCommand(program);
    return program;
  }

  describe('list', () => {
    it('should display topics', async () => {
      mockTrpcClient.topic.getTopics.query.mockResolvedValue([
        { id: 't1', title: 'Topic 1', updatedAt: new Date().toISOString() },
      ]);

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'topic', 'list']);

      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });

    it('should filter by agent-id', async () => {
      mockTrpcClient.topic.getTopics.query.mockResolvedValue([]);

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'topic', 'list', '--agent-id', 'a1']);

      expect(mockTrpcClient.topic.getTopics.query).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'a1' }),
      );
    });
  });

  describe('search', () => {
    it('should search topics', async () => {
      mockTrpcClient.topic.searchTopics.query.mockResolvedValue([]);

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'topic', 'search', 'hello']);

      expect(mockTrpcClient.topic.searchTopics.query).toHaveBeenCalledWith(
        expect.objectContaining({ keywords: 'hello' }),
      );
    });
  });

  describe('create', () => {
    it('should create a topic', async () => {
      mockTrpcClient.topic.createTopic.mutate.mockResolvedValue({ id: 't-new' });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'topic', 'create', '-t', 'New Topic']);

      expect(mockTrpcClient.topic.createTopic.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New Topic' }),
      );
    });
  });

  describe('bind-current-device', () => {
    it('should bind the current device to the topic', async () => {
      mockLoadSettings.mockReturnValue({ currentDeviceId: 'device-1' });
      mockTrpcClient.aiAgent.listOnlineDevices.query.mockResolvedValue({
        devices: [{ deviceId: 'device-1', online: true }],
        gatewayConfigured: true,
      });
      mockTrpcClient.topic.updateTopicMetadata.mutate.mockResolvedValue([{ id: 't1' }]);

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'topic', 'bind-current-device', 't1']);

      expect(mockTrpcClient.aiAgent.listOnlineDevices.query).toHaveBeenCalledWith();
      expect(mockTrpcClient.topic.updateTopicMetadata.mutate).toHaveBeenCalledWith({
        id: 't1',
        metadata: { boundDeviceId: 'device-1' },
      });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Bound topic'));
    });

    it('should fail when the current device is unavailable', async () => {
      mockLoadSettings.mockReturnValue({ currentDeviceId: 'device-1' });
      mockTrpcClient.aiAgent.listOnlineDevices.query.mockResolvedValue({
        devices: [],
        gatewayConfigured: true,
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'topic', 'bind-current-device', 't1']);

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('offline or unavailable'));
      expect(mockTrpcClient.topic.updateTopicMetadata.mutate).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('unbind-device', () => {
    it('should remove the topic bound device', async () => {
      mockTrpcClient.topic.updateTopicMetadata.mutate.mockResolvedValue([{ id: 't1' }]);

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'topic', 'unbind-device', 't1']);

      expect(mockTrpcClient.topic.updateTopicMetadata.mutate).toHaveBeenCalledWith({
        id: 't1',
        metadata: { boundDeviceId: null },
      });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unbound remote device'));
    });
  });

  describe('edit', () => {
    it('should update a topic', async () => {
      mockTrpcClient.topic.updateTopic.mutate.mockResolvedValue({});

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'topic', 'edit', 't1', '-t', 'Updated']);

      expect(mockTrpcClient.topic.updateTopic.mutate).toHaveBeenCalledWith({
        id: 't1',
        value: { title: 'Updated' },
      });
    });

    it('should exit when no changes', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'topic', 'edit', 't1']);

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('No changes'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('delete', () => {
    it('should delete single topic', async () => {
      mockTrpcClient.topic.removeTopic.mutate.mockResolvedValue({});

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'topic', 'delete', 't1', '--yes']);

      expect(mockTrpcClient.topic.removeTopic.mutate).toHaveBeenCalledWith({ id: 't1' });
    });

    it('should batch delete multiple topics', async () => {
      mockTrpcClient.topic.batchDelete.mutate.mockResolvedValue({});

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'topic', 'delete', 't1', 't2', '--yes']);

      expect(mockTrpcClient.topic.batchDelete.mutate).toHaveBeenCalledWith({
        ids: ['t1', 't2'],
      });
    });
  });

  describe('recent', () => {
    it('should list recent topics', async () => {
      mockTrpcClient.topic.recentTopics.query.mockResolvedValue([
        { id: 't1', title: 'Recent', updatedAt: new Date().toISOString() },
      ]);

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'topic', 'recent']);

      expect(mockTrpcClient.topic.recentTopics.query).toHaveBeenCalledWith({ limit: 10 });
    });
  });
});
