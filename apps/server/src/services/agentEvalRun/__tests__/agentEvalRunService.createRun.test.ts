import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentEvalBenchmarkModel, AgentEvalRunTopicModel } from '@/database/models/agentEval';
import {
  agentEvalDatasets,
  agentEvalRuns,
  agentEvalTestCases,
  agents,
  topics,
} from '@/database/schemas';
import { AgentEvalRunService } from '@/server/services/agentEvalRun';

import { cleanupDB, serverDB, userId } from './_setup';

const { mockGetAgentConfigById } = vi.hoisted(() => ({
  mockGetAgentConfigById: vi.fn(),
}));

vi.mock('@/server/services/agent', () => ({
  AgentService: vi.fn().mockImplementation(() => ({
    getAgentConfigById: mockGetAgentConfigById,
  })),
}));

vi.mock('@/server/services/agentRuntime/AgentRuntimeService', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(() => ({
    interruptOperation: vi.fn().mockResolvedValue(true),
  })),
}));

beforeEach(async () => {
  await cleanupDB();
  mockGetAgentConfigById.mockReset();
});

describe('AgentEvalRunService', () => {
  describe('createRun', () => {
    it('should pre-create Topics and RunTopics with pending status', async () => {
      const benchmarkModel = new AgentEvalBenchmarkModel(serverDB, userId);
      const benchmark = await benchmarkModel.create({
        identifier: 'test-benchmark',
        isSystem: false,
        name: 'Test Benchmark',
        rubrics: [],
      });

      const [dataset] = await serverDB
        .insert(agentEvalDatasets)
        .values({
          benchmarkId: benchmark.id,
          identifier: 'test-dataset',
          name: 'Test Dataset',
          userId,
        })
        .returning();

      // Create 3 test cases
      const testCases = [];
      for (let i = 0; i < 3; i++) {
        const [tc] = await serverDB
          .insert(agentEvalTestCases)
          .values({
            userId,
            content: { expected: '42', input: `Question ${i + 1}` },
            datasetId: dataset.id,
            sortOrder: i + 1,
          })
          .returning();
        testCases.push(tc);
      }

      const service = new AgentEvalRunService(serverDB, userId);
      const run = await service.createRun({ datasetId: dataset.id, name: 'Pre-create Test' });

      // Verify RunTopics were created with pending status
      const runTopicModel = new AgentEvalRunTopicModel(serverDB, userId);
      const runTopics = await runTopicModel.findByRunId(run.id);

      expect(runTopics).toHaveLength(3);
      for (const rt of runTopics) {
        expect(rt.status).toBe('pending');
        expect(rt.topicId).toBeTruthy();
      }

      // Verify each test case has a corresponding RunTopic
      const testCaseIds = runTopics.map((rt) => rt.testCaseId).sort();
      const expectedIds = testCases.map((tc) => tc.id).sort();
      expect(testCaseIds).toEqual(expectedIds);

      // Verify topics were created with trigger='eval'
      for (const rt of runTopics) {
        const [topic] = await serverDB.select().from(topics).where(eq(topics.id, rt.topicId));
        expect(topic).toBeDefined();
        expect(topic.trigger).toBe('eval');
      }
    });

    it('should handle dataset with no test cases', async () => {
      const benchmarkModel = new AgentEvalBenchmarkModel(serverDB, userId);
      const benchmark = await benchmarkModel.create({
        identifier: 'empty-benchmark',
        isSystem: false,
        name: 'Empty Benchmark',
        rubrics: [],
      });

      const [dataset] = await serverDB
        .insert(agentEvalDatasets)
        .values({
          benchmarkId: benchmark.id,
          identifier: 'empty-dataset',
          name: 'Empty Dataset',
          userId,
        })
        .returning();

      const service = new AgentEvalRunService(serverDB, userId);
      const run = await service.createRun({ datasetId: dataset.id, name: 'Empty Test' });

      const runTopicModel = new AgentEvalRunTopicModel(serverDB, userId);
      const runTopics = await runTopicModel.findByRunId(run.id);

      expect(runTopics).toHaveLength(0);
      expect(run.id).toBeTruthy();
    });

    it('should freeze runtime-relevant agent fields into agentSnapshot', async () => {
      mockGetAgentConfigById.mockResolvedValue({
        agencyConfig: { boundDeviceId: 'device-1' },
        avatar: 'avatar.png',
        chatConfig: { enableHistoryCount: false, memory: { enabled: false } },
        files: [{ content: 'file content', enabled: true, id: 'file-1', name: 'notes.md' }],
        fewShots: [{ content: 'few-shot' }],
        knowledgeBases: [{ enabled: true, id: 'kb-1', name: 'Knowledge Base' }],
        model: 'gpt-4o-mini',
        params: { temperature: 0.1 },
        plugins: ['lobe-web-browsing'],
        provider: 'openai',
        systemRole: 'Frozen system role',
        title: 'Frozen Agent',
      });

      const benchmarkModel = new AgentEvalBenchmarkModel(serverDB, userId);
      const benchmark = await benchmarkModel.create({
        identifier: 'snapshot-benchmark',
        isSystem: false,
        name: 'Snapshot Benchmark',
        rubrics: [],
      });

      const [dataset] = await serverDB
        .insert(agentEvalDatasets)
        .values({
          benchmarkId: benchmark.id,
          identifier: 'snapshot-dataset',
          name: 'Snapshot Dataset',
          userId,
        })
        .returning();

      await serverDB.insert(agents).values({
        id: 'agent-1',
        userId,
      });

      const service = new AgentEvalRunService(serverDB, userId);
      const run = await service.createRun({
        datasetId: dataset.id,
        name: 'Snapshot Run',
        targetAgentId: 'agent-1',
      });

      expect(run.config?.agentSnapshot).toMatchObject({
        agencyConfig: { boundDeviceId: 'device-1' },
        avatar: 'avatar.png',
        chatConfig: { enableHistoryCount: false, memory: { enabled: false } },
        codeCommitSha: expect.any(String),
        files: [{ content: 'file content', enabled: true, id: 'file-1', name: 'notes.md' }],
        fewShots: [{ content: 'few-shot' }],
        knowledgeBases: [{ enabled: true, id: 'kb-1', name: 'Knowledge Base' }],
        model: 'gpt-4o-mini',
        params: { temperature: 0.1 },
        plugins: ['lobe-web-browsing'],
        provider: 'openai',
        systemRole: 'Frozen system role',
        title: 'Frozen Agent',
      });
    });

    it('should fork using parent agent id and regenerate snapshot from current agent config', async () => {
      mockGetAgentConfigById
        .mockResolvedValueOnce({
          model: 'gpt-4o-mini',
          provider: 'openai',
          systemRole: 'Parent snapshot',
          title: 'Parent Agent',
        })
        .mockResolvedValueOnce({
          model: 'claude-3-7-sonnet',
          provider: 'anthropic',
          systemRole: 'Fork snapshot',
          title: 'Fork Agent',
        });

      const benchmarkModel = new AgentEvalBenchmarkModel(serverDB, userId);
      const benchmark = await benchmarkModel.create({
        identifier: 'fork-snapshot-benchmark',
        isSystem: false,
        name: 'Fork Snapshot Benchmark',
        rubrics: [],
      });

      const [dataset] = await serverDB
        .insert(agentEvalDatasets)
        .values({
          benchmarkId: benchmark.id,
          identifier: 'fork-snapshot-dataset',
          name: 'Fork Snapshot Dataset',
          userId,
        })
        .returning();

      await serverDB.insert(agentEvalTestCases).values({
        content: { expected: '42', input: 'Question 1' },
        datasetId: dataset.id,
        sortOrder: 1,
        userId,
      });

      await serverDB.insert(agents).values({
        id: 'agent-1',
        userId,
      });

      const service = new AgentEvalRunService(serverDB, userId);
      const parentRun = await service.createRun({
        config: { k: 3, maxSteps: 40, timeout: 120000 },
        datasetId: dataset.id,
        name: 'Parent Run',
        targetAgentId: 'agent-1',
      });

      const forkedRun = await service.createRun({
        datasetId: dataset.id,
        name: 'Forked Run',
        parentRunId: parentRun.id,
      });

      const runTopicModel = new AgentEvalRunTopicModel(serverDB, userId);
      const forkRunTopics = await runTopicModel.findByRunId(forkedRun.id);
      const [forkTopic] = await serverDB
        .select()
        .from(topics)
        .where(eq(topics.id, forkRunTopics[0].topicId));
      expect(forkTopic?.agentId).toBe('agent-1');

      expect(forkedRun.targetAgentId).toBe('agent-1');
      expect(forkedRun.config).toMatchObject({
        k: 3,
        maxSteps: 40,
        timeout: 120000,
      });
      expect(forkedRun.config?.agentSnapshot).toMatchObject({
        codeCommitSha: expect.any(String),
        model: 'claude-3-7-sonnet',
        provider: 'anthropic',
        systemRole: 'Fork snapshot',
        title: 'Fork Agent',
      });
      expect(forkedRun.config?.agentSnapshot).not.toEqual(parentRun.config?.agentSnapshot);
    });

    it('should reject overriding immutable fields when forking a run', async () => {
      mockGetAgentConfigById.mockResolvedValue({
        model: 'gpt-4o-mini',
        provider: 'openai',
        title: 'Frozen Agent',
      });

      const benchmarkModel = new AgentEvalBenchmarkModel(serverDB, userId);
      const benchmark = await benchmarkModel.create({
        identifier: 'fork-immutable-benchmark',
        isSystem: false,
        name: 'Fork Immutable Benchmark',
        rubrics: [],
      });

      const [datasetA] = await serverDB
        .insert(agentEvalDatasets)
        .values({
          benchmarkId: benchmark.id,
          identifier: 'fork-dataset-a',
          name: 'Fork Dataset A',
          userId,
        })
        .returning();

      const [datasetB] = await serverDB
        .insert(agentEvalDatasets)
        .values({
          benchmarkId: benchmark.id,
          identifier: 'fork-dataset-b',
          name: 'Fork Dataset B',
          userId,
        })
        .returning();

      await serverDB.insert(agents).values([
        { id: 'agent-1', userId },
        { id: 'agent-2', userId },
      ]);

      const service = new AgentEvalRunService(serverDB, userId);
      const parentRun = await service.createRun({
        config: { k: 2, timeout: 120000 },
        datasetId: datasetA.id,
        name: 'Parent Run',
        targetAgentId: 'agent-1',
      });

      await expect(
        service.createRun({
          config: { k: 4 },
          datasetId: datasetA.id,
          name: 'Fork With Config Override',
          parentRunId: parentRun.id,
        }),
      ).rejects.toThrow('Fork run cannot override run config');

      await expect(
        service.createRun({
          datasetId: datasetB.id,
          name: 'Fork With Dataset Override',
          parentRunId: parentRun.id,
        }),
      ).rejects.toThrow('Fork run cannot change dataset');

      await expect(
        service.createRun({
          datasetId: datasetA.id,
          name: 'Fork With Agent Override',
          parentRunId: parentRun.id,
          targetAgentId: 'agent-2',
        }),
      ).rejects.toThrow('Fork run cannot override target agent');

      const persistedRuns = await serverDB
        .select()
        .from(agentEvalRuns)
        .where(eq(agentEvalRuns.userId, userId));
      expect(persistedRuns).toHaveLength(1);
    });
  });
});
