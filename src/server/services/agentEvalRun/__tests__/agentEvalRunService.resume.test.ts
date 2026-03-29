import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentEvalRunModel, AgentEvalRunTopicModel } from '@/database/models/agentEval';
import { ThreadModel } from '@/database/models/thread';
import { messages } from '@/database/schemas';
import { AgentEvalRunService } from '@/server/services/agentEvalRun';
import type * as AgentEvalRunWorkflowModule from '@/server/workflows/agentEvalRun';
import { AgentEvalRunWorkflow } from '@/server/workflows/agentEvalRun';

import { cleanupDB, serverDB, setupEvalChain, userId } from './_setup';

const mockExecAgent = vi.fn();

vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn().mockImplementation(() => ({
    execAgent: mockExecAgent,
  })),
}));

vi.mock('@/server/workflows/agentEvalRun', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof AgentEvalRunWorkflowModule;

  return {
    ...actual,
    AgentEvalRunWorkflow: {
      ...actual.AgentEvalRunWorkflow,
      triggerResumeAgentTrajectory: vi.fn().mockResolvedValue({}),
      triggerResumeThreadTrajectory: vi.fn().mockResolvedValue({}),
    },
  };
});

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
  vi.mocked(AgentEvalRunWorkflow.triggerResumeAgentTrajectory).mockReset();
  vi.mocked(AgentEvalRunWorkflow.triggerResumeThreadTrajectory).mockReset();
});

describe('AgentEvalRunService', () => {
  describe('getRunRetryInfo', () => {
    it('should return retryable timeout count for terminal runs', async () => {
      const { run, topic } = await setupEvalChain({ totalCases: 1 });

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
    it('should prepare and trigger a timed-out pass@1 trajectory resume from the persisted message chain', async () => {
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

      const service = new AgentEvalRunService(serverDB, userId);
      const result = await service.resumeTrajectory({ runId: run.id, testCaseId: testCase.id });

      expect(result).toEqual({
        mode: 'single',
        runId: run.id,
        testCaseId: testCase.id,
        threadId: undefined,
        topicId: topic.id,
        triggered: true,
      });

      expect(AgentEvalRunWorkflow.triggerResumeAgentTrajectory).toHaveBeenCalledWith(
        expect.objectContaining({
          appContext: { topicId: topic.id },
          envPrompt: undefined,
          maxSteps: undefined,
          parentMessageId: userMessage.id,
          runId: run.id,
          testCaseId: testCase.id,
          topicId: topic.id,
          userId,
        }),
      );
      expect(mockExecAgent).not.toHaveBeenCalled();

      const refreshedRun = await runModel.findById(run.id);
      expect(refreshedRun?.status).toBe('running');
      expect(refreshedRun?.metrics).toMatchObject({
        completedCases: 0,
        timeoutCases: 0,
      });

      const refreshedRunTopic = await runTopicModel.findByRunAndTestCase(run.id, testCase.id);
      expect(refreshedRunTopic?.status).toBe('running');
      expect(refreshedRunTopic?.evalResult).toBeNull();
    });

    it('should prepare and trigger a timed-out pass@k thread resume without touching other threads', async () => {
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
      const otherThread = await threadModel.create({ topicId: topic.id, type: 'eval' });

      await threadModel.update(otherThread!.id, {
        metadata: {
          completedAt: new Date().toISOString(),
          operationId: 'op-other-thread',
          passed: true,
          score: 1,
          testCaseId: testCase.id,
        } as any,
      });

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

      const service = new AgentEvalRunService(serverDB, userId);
      const result = await service.resumeTrajectory({
        runId: run.id,
        testCaseId: testCase.id,
        threadId: thread!.id,
      });

      expect(result).toEqual({
        mode: 'thread',
        runId: run.id,
        testCaseId: testCase.id,
        threadId: thread!.id,
        topicId: topic.id,
        triggered: true,
      });

      expect(AgentEvalRunWorkflow.triggerResumeThreadTrajectory).toHaveBeenCalledWith(
        expect.objectContaining({
          appContext: { threadId: thread!.id, topicId: topic.id },
          envPrompt: undefined,
          maxSteps: undefined,
          parentMessageId: threadUserMessage.id,
          runId: run.id,
          testCaseId: testCase.id,
          threadId: thread!.id,
          topicId: topic.id,
          userId,
        }),
      );
      expect(mockExecAgent).not.toHaveBeenCalled();

      const updatedThread = await threadModel.findById(thread!.id);
      expect(updatedThread?.metadata).toEqual({ testCaseId: testCase.id });

      const untouchedThread = await threadModel.findById(otherThread!.id);
      expect(untouchedThread?.metadata).toMatchObject({
        operationId: 'op-other-thread',
        passed: true,
        score: 1,
        testCaseId: testCase.id,
      });

      const refreshedRunTopic = await runTopicModel.findByRunAndTestCase(run.id, testCase.id);
      expect(refreshedRunTopic?.status).toBe('running');
    });
  });

  describe('executeResumedTrajectory', () => {
    it('should call execAgent in resume mode and store operationId on runTopic', async () => {
      const { run, testCase, topic } = await setupEvalChain({ totalCases: 1 });

      const runTopicModel = new AgentEvalRunTopicModel(serverDB, userId);
      await runTopicModel.updateByRunAndTopic(run.id, topic.id, {
        status: 'running',
      });

      mockExecAgent.mockResolvedValue({ operationId: 'op-resume-1' });

      const service = new AgentEvalRunService(serverDB, userId);
      const result = await service.executeResumedTrajectory({
        appContext: { topicId: topic.id },
        parentMessageId: 'parent-message-id',
        runId: run.id,
        testCaseId: testCase.id,
        topicId: topic.id,
        userId,
      });

      expect(result).toEqual({ topicId: topic.id });
      expect(mockExecAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          appContext: { topicId: topic.id },
          parentMessageId: 'parent-message-id',
          prompt: '',
          resume: true,
        }),
      );

      const refreshedRunTopic = await runTopicModel.findByRunAndTestCase(run.id, testCase.id);
      expect(refreshedRunTopic?.evalResult).toEqual({
        operationId: 'op-resume-1',
        rubricScores: [],
      });
    });
  });

  describe('executeResumedThreadTrajectory', () => {
    it('should call execAgent in resume mode and store operationId on target thread metadata', async () => {
      const { run, testCase, topic } = await setupEvalChain({ totalCases: 1 });

      const runModel = new AgentEvalRunModel(serverDB, userId);
      await runModel.update(run.id, { config: { k: 2 } });

      const threadModel = new ThreadModel(serverDB, userId);
      const thread = await threadModel.create({ topicId: topic.id, type: 'eval' });

      mockExecAgent.mockResolvedValue({ operationId: 'op-thread-resume-1' });

      const service = new AgentEvalRunService(serverDB, userId);
      const result = await service.executeResumedThreadTrajectory({
        appContext: { threadId: thread!.id, topicId: topic.id },
        parentMessageId: 'parent-message-id',
        runId: run.id,
        testCaseId: testCase.id,
        threadId: thread!.id,
        topicId: topic.id,
        userId,
      });

      expect(result).toEqual({ threadId: thread!.id, topicId: topic.id });
      expect(mockExecAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          appContext: { threadId: thread!.id, topicId: topic.id },
          parentMessageId: 'parent-message-id',
          prompt: '',
          resume: true,
        }),
      );

      const updatedThread = await threadModel.findById(thread!.id);
      expect(updatedThread?.metadata).toEqual({
        operationId: 'op-thread-resume-1',
        testCaseId: testCase.id,
      });
    });
  });
});
