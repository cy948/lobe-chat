import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentEvalRunModel, AgentEvalRunTopicModel } from '@/database/models/agentEval';
import { ThreadModel } from '@/database/models/thread';
import { messages } from '@/database/schemas';
import { AgentEvalRunService } from '@/server/services/agentEvalRun';

import { cleanupDB, serverDB, setupEvalChain, userId } from './_setup';

const mockExecAgent = vi.fn();

vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn().mockImplementation(() => ({
    execAgent: mockExecAgent,
  })),
}));

vi.mock('@/envs/app', () => ({
  appEnv: { APP_URL: 'https://test.example.com' },
}));

vi.mock('@/server/services/agentRuntime/AgentRuntimeService', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(() => ({
    interruptOperation: vi.fn().mockResolvedValue(true),
  })),
}));

beforeEach(async () => {
  await cleanupDB();
  mockExecAgent.mockReset();
});

describe('AgentEvalRunService', () => {
  describe('getRunRetryInfo', () => {
    it('should return retryable timeout count for terminal runs', async () => {
      const { run, testCase, topic } = await setupEvalChain({ totalCases: 1 });

      const runModel = new AgentEvalRunModel(serverDB, userId);
      await runModel.update(run.id, { status: 'failed' });

      const runTopicModel = new AgentEvalRunTopicModel(serverDB, userId);
      await runTopicModel.updateByRunAndTopic(run.id, topic.id, {
        evalResult: { completionReason: 'timeout', rubricScores: [] },
        passed: false,
        score: 0,
        status: 'timeout',
      });

      const service = new AgentEvalRunService(serverDB, userId);
      await expect(service.getRunRetryInfo(run.id)).resolves.toEqual({
        canRetry: true,
        retryableCount: 1,
      });
    });
  });

  describe('resumeTrajectory', () => {
    it('should resume a timed-out pass@1 trajectory from the persisted message chain', async () => {
      const { run, testCase, topic } = await setupEvalChain({ totalCases: 1 });

      const [userMessage] = await serverDB
        .insert(messages)
        .values({
          content: 'What is 6*7?',
          role: 'user',
          topicId: topic.id,
          userId,
        })
        .returning();

      await serverDB.insert(messages).values({
        content: '...',
        parentId: userMessage.id,
        role: 'assistant',
        topicId: topic.id,
        userId,
      });

      const runModel = new AgentEvalRunModel(serverDB, userId);
      await runModel.update(run.id, {
        metrics: {
          averageScore: 0,
          completedCases: 1,
          failedCases: 0,
          passRate: 0,
          passedCases: 0,
          timeoutCases: 1,
          totalCases: 1,
        },
        status: 'failed',
      });

      const runTopicModel = new AgentEvalRunTopicModel(serverDB, userId);
      await runTopicModel.updateByRunAndTopic(run.id, topic.id, {
        evalResult: { completionReason: 'timeout', duration: 1000, rubricScores: [] },
        passed: false,
        score: 0,
        status: 'timeout',
      });

      mockExecAgent.mockResolvedValue({ operationId: 'op-resume-1' });

      const service = new AgentEvalRunService(serverDB, userId);
      const result = await service.resumeTrajectory({ runId: run.id, testCaseId: testCase.id });

      expect(result).toEqual({
        operationId: 'op-resume-1',
        parentMessageId: userMessage.id,
        topicId: topic.id,
      });

      expect(mockExecAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          appContext: { topicId: topic.id },
          parentMessageId: userMessage.id,
          prompt: '',
          resume: true,
        }),
      );

      const refreshedRun = await runModel.findById(run.id);
      expect(refreshedRun?.status).toBe('running');
      expect(refreshedRun?.metrics).toMatchObject({
        completedCases: 0,
        timeoutCases: 0,
      });

      const refreshedRunTopic = await runTopicModel.findByRunAndTestCase(run.id, testCase.id);
      expect(refreshedRunTopic?.status).toBe('running');
      expect(refreshedRunTopic?.evalResult).toEqual({
        operationId: 'op-resume-1',
        rubricScores: [],
      });
    });

    it('should resume a timed-out pass@k thread trajectory and store the new operationId on thread metadata', async () => {
      const { run, testCase, topic } = await setupEvalChain({ totalCases: 1 });

      const runModel = new AgentEvalRunModel(serverDB, userId);
      await runModel.update(run.id, {
        config: { k: 2 },
        metrics: {
          averageScore: 0,
          completedCases: 1,
          failedCases: 0,
          passRate: 0,
          passedCases: 0,
          timeoutCases: 1,
          totalCases: 1,
        },
        status: 'failed',
      });

      const runTopicModel = new AgentEvalRunTopicModel(serverDB, userId);
      await runTopicModel.updateByRunAndTopic(run.id, topic.id, {
        evalResult: { completionReason: 'timeout' },
        passed: false,
        score: 0,
        status: 'timeout',
      });

      const threadModel = new ThreadModel(serverDB, userId);
      const thread = await threadModel.create({ topicId: topic.id, type: 'eval' });

      const [threadUserMessage] = await serverDB
        .insert(messages)
        .values({
          content: 'thread user prompt',
          role: 'user',
          threadId: thread!.id,
          topicId: topic.id,
          userId,
        })
        .returning();

      await serverDB.insert(messages).values({
        content: '...',
        parentId: threadUserMessage.id,
        role: 'assistant',
        threadId: thread!.id,
        topicId: topic.id,
        userId,
      });

      mockExecAgent.mockResolvedValue({ operationId: 'op-thread-resume-1' });

      const service = new AgentEvalRunService(serverDB, userId);
      await service.resumeTrajectory({
        runId: run.id,
        testCaseId: testCase.id,
        threadId: thread!.id,
      });

      expect(mockExecAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          appContext: { threadId: thread!.id, topicId: topic.id },
          parentMessageId: threadUserMessage.id,
          prompt: '',
          resume: true,
        }),
      );

      const updatedThread = await threadModel.findById(thread!.id);
      expect(updatedThread?.metadata).toEqual({
        operationId: 'op-thread-resume-1',
        testCaseId: testCase.id,
      });

      const refreshedRunTopic = await runTopicModel.findByRunAndTestCase(run.id, testCase.id);
      expect(refreshedRunTopic?.status).toBe('running');
    });
  });
});
