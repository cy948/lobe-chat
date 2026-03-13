import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentEvalRunModel, AgentEvalRunTopicModel } from '@/database/models/agentEval';
import { ThreadModel } from '@/database/models/thread';
import { messages } from '@/database/schemas';
import { AgentEvalRunService } from '@/server/services/agentEvalRun';

import { cleanupDB, serverDB, setupMultiCaseRun, userId } from './_setup';

const agentRuntimeMocks = vi.hoisted(() => ({
  getOperationStatus: vi.fn(),
  interruptOperation: vi.fn().mockResolvedValue(true),
  startExecution: vi.fn().mockResolvedValue({ success: true }),
}));

const aiAgentMocks = vi.hoisted(() => ({
  execAgent: vi.fn().mockResolvedValue({
    agentId: 'agt-resume',
    assistantMessageId: 'msg-assistant',
    autoStarted: false,
    createdAt: new Date().toISOString(),
    message: 'Agent operation created successfully',
    operationId: 'op-recreated',
    status: 'created',
    success: true,
    timestamp: new Date().toISOString(),
    topicId: 'topic-resume',
    userMessageId: 'msg-user',
  }),
}));

vi.mock('@/server/services/agentRuntime/AgentRuntimeService', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(() => ({
    getOperationStatus: agentRuntimeMocks.getOperationStatus,
    interruptOperation: agentRuntimeMocks.interruptOperation,
    startExecution: agentRuntimeMocks.startExecution,
  })),
}));

vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn().mockImplementation(() => ({
    execAgent: aiAgentMocks.execAgent,
  })),
}));

vi.mock('@/envs/app', () => ({
  appEnv: { APP_URL: 'https://example.com' },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = 'https://example.com';
  return cleanupDB();
});

describe('AgentEvalRunService resume timeout', () => {
  it('should resume a timed-out single-case run with the latest redis execution context', async () => {
    const { run, cases } = await setupMultiCaseRun([{ assistantOutput: null }]);
    const runModel = new AgentEvalRunModel(serverDB, userId);
    await runModel.update(run.id, {
      metrics: { totalCases: 1 } as any,
      status: 'failed',
    });

    const runTopicModel = new AgentEvalRunTopicModel(serverDB, userId);
    const runTopic = await runTopicModel.findByRunAndTestCase(run.id, cases[0].testCase.id);
    await runTopicModel.updateByRunAndTopic(run.id, runTopic!.topicId, {
      evalResult: {
        completionReason: 'timeout',
        duration: 30_000,
        operationId: 'op-existing',
        rubricScores: [],
      },
      status: 'timeout',
    });

    agentRuntimeMocks.getOperationStatus.mockResolvedValue({
      currentState: { status: 'interrupted' },
      executionHistory: [
        {
          context: {
            payload: { parentMessageId: 'tool-message-id' },
            phase: 'tool_result',
          },
        },
      ],
    });

    const service = new AgentEvalRunService(serverDB, userId);
    const result = await service.resumeTimeoutCase(run.id, cases[0].testCase.id);

    expect(result).toEqual({ resumedCount: 1 });
    expect(agentRuntimeMocks.startExecution).toHaveBeenCalledWith({
      context: {
        payload: { parentMessageId: 'tool-message-id' },
        phase: 'tool_result',
      },
      operationId: 'op-existing',
      priority: 'high',
    });
    expect(aiAgentMocks.execAgent).not.toHaveBeenCalled();
  });

  it('should recreate an expired operation from persisted tool-result boundary', async () => {
    const { run, cases } = await setupMultiCaseRun([{ assistantOutput: null }]);
    const runModel = new AgentEvalRunModel(serverDB, userId);
    await runModel.update(run.id, {
      config: {
        agentSnapshot: {
          model: 'gpt-4o-mini',
          plugins: [],
          provider: 'openai',
        },
      } as any,
      metrics: { totalCases: 1 } as any,
    });

    const runTopicModel = new AgentEvalRunTopicModel(serverDB, userId);
    const runTopic = await runTopicModel.findByRunAndTestCase(run.id, cases[0].testCase.id);
    await runTopicModel.updateByRunAndTopic(run.id, runTopic!.topicId, {
      evalResult: {
        completionReason: 'timeout',
        duration: 120_000,
        operationId: 'op-expired',
        rubricScores: [],
      },
      status: 'timeout',
    });

    const [userMessage] = await serverDB
      .insert(messages)
      .values({
        content: 'Q0',
        role: 'user',
        topicId: runTopic!.topicId,
        userId,
      })
      .returning();

    await serverDB.insert(messages).values({
      content: '',
      parentId: userMessage.id,
      role: 'assistant',
      tools: [
        {
          apiName: 'search',
          arguments: '{"q":"weather"}',
          id: 'tool-call-1',
          identifier: 'lobe-web-browsing',
          type: 'builtin',
        },
      ],
      topicId: runTopic!.topicId,
      userId,
    });

    const [toolMessage] = await serverDB
      .insert(messages)
      .values({
        content: 'Sunny',
        role: 'tool',
        topicId: runTopic!.topicId,
        userId,
      })
      .returning();

    agentRuntimeMocks.getOperationStatus.mockResolvedValue(null);

    const service = new AgentEvalRunService(serverDB, userId);
    const result = await service.resumeTimeoutCase(run.id, cases[0].testCase.id);

    expect(result).toEqual({ resumedCount: 1 });
    expect(aiAgentMocks.execAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentSnapshot: expect.objectContaining({
          model: 'gpt-4o-mini',
          provider: 'openai',
        }),
        appContext: { agentId: undefined, topicId: runTopic!.topicId },
        autoStart: false,
        initialContext: expect.objectContaining({
          payload: { parentMessageId: toolMessage.id },
          phase: 'tool_result',
        }),
      }),
    );
    expect(agentRuntimeMocks.startExecution).toHaveBeenCalledWith({
      context: expect.objectContaining({
        payload: { parentMessageId: toolMessage.id },
        phase: 'tool_result',
      }),
      operationId: 'op-recreated',
      priority: 'high',
    });

    const updatedRunTopic = await runTopicModel.findByRunAndTestCase(run.id, cases[0].testCase.id);
    expect(updatedRunTopic?.evalResult?.operationId).toBe('op-recreated');
    expect(updatedRunTopic?.status).toBe('running');
  });

  it('should recreate only incomplete eval threads and infer llm_result from assistant tool calls', async () => {
    const { run, cases } = await setupMultiCaseRun([{ assistantOutput: null }]);
    const runModel = new AgentEvalRunModel(serverDB, userId);
    await runModel.update(run.id, {
      config: {
        agentSnapshot: {
          model: 'gpt-4o-mini',
          plugins: [],
          provider: 'openai',
        },
        k: 2,
      } as any,
      metrics: { totalCases: 1 } as any,
    });

    const runTopicModel = new AgentEvalRunTopicModel(serverDB, userId);
    const runTopic = await runTopicModel.findByRunAndTestCase(run.id, cases[0].testCase.id);
    await runTopicModel.updateByRunAndTopic(run.id, runTopic!.topicId, {
      evalResult: { completionReason: 'timeout', duration: 30_000, rubricScores: [] },
      status: 'timeout',
    });

    const threadModel = new ThreadModel(serverDB, userId);
    const pendingThread = await threadModel.create({
      metadata: {
        operationId: 'op-thread-1',
      } as any,
      topicId: runTopic!.topicId,
      type: 'eval',
    });
    await threadModel.create({
      metadata: {
        completedAt: new Date().toISOString(),
        operationId: 'op-thread-2',
      } as any,
      topicId: runTopic!.topicId,
      type: 'eval',
    });

    const [threadUserMessage] = await serverDB
      .insert(messages)
      .values({
        content: 'Q0',
        role: 'user',
        threadId: pendingThread!.id,
        topicId: runTopic!.topicId,
        userId,
      })
      .returning();

    const [threadAssistantMessage] = await serverDB
      .insert(messages)
      .values({
        content: '',
        parentId: threadUserMessage.id,
        role: 'assistant',
        threadId: pendingThread!.id,
        tools: [
          {
            apiName: 'search',
            arguments: '{"q":"weather"}',
            id: 'tool-call-thread',
            identifier: 'lobe-web-browsing',
            type: 'builtin',
          },
        ],
        topicId: runTopic!.topicId,
        userId,
      })
      .returning();

    agentRuntimeMocks.getOperationStatus.mockResolvedValue(null);

    const service = new AgentEvalRunService(serverDB, userId);
    const result = await service.resumeTimeoutCase(run.id, cases[0].testCase.id);

    expect(result).toEqual({ resumedCount: 1 });
    expect(aiAgentMocks.execAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentSnapshot: expect.objectContaining({
          model: 'gpt-4o-mini',
          provider: 'openai',
        }),
        appContext: {
          agentId: undefined,
          threadId: pendingThread!.id,
          topicId: runTopic!.topicId,
        },
        autoStart: false,
        initialContext: expect.objectContaining({
          phase: 'llm_result',
          payload: expect.objectContaining({
            hasToolsCalling: true,
            parentMessageId: threadAssistantMessage.id,
          }),
        }),
      }),
    );
    expect(agentRuntimeMocks.startExecution).toHaveBeenCalledTimes(1);

    const updatedPendingThread = await threadModel.findById(pendingThread!.id);
    expect(updatedPendingThread?.metadata?.operationId).toBe('op-recreated');
  });

  it('should skip previewing timeout cases whose duration exceeded the configured timeout', async () => {
    const { run, cases } = await setupMultiCaseRun([{ assistantOutput: null }]);
    const runModel = new AgentEvalRunModel(serverDB, userId);
    await runModel.update(run.id, {
      config: { timeout: 60_000 } as any,
      metrics: { totalCases: 1 } as any,
    });

    const runTopicModel = new AgentEvalRunTopicModel(serverDB, userId);
    const runTopic = await runTopicModel.findByRunAndTestCase(run.id, cases[0].testCase.id);
    await runTopicModel.updateByRunAndTopic(run.id, runTopic!.topicId, {
      evalResult: {
        completionReason: 'timeout',
        duration: 120_000,
        operationId: 'op-expired',
        rubricScores: [],
      },
      status: 'timeout',
    });

    const service = new AgentEvalRunService(serverDB, userId);
    const preview = await service.previewTimeoutResumes(run.id);

    expect(preview.eligibleTopics).toHaveLength(0);
    expect(preview.skippedTopics).toEqual([
      expect.objectContaining({
        reason: 'timeout_exceeded',
        testCaseId: cases[0].testCase.id,
        topicId: runTopic!.topicId,
      }),
    ]);
  });
});
