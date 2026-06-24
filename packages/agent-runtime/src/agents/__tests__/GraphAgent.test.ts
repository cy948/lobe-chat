import { afterEach, describe, expect, it } from 'vitest';

import type { AgentRuntimeContext, AgentState, ReasoningGraph } from '../../types';
import { GraphAgent } from '../GraphAgent';

const GRAPH_CONTEXT_KEY = '__graphContext';

const createMockState = (overrides?: Partial<AgentState>): AgentState => ({
  operationId: 'graph-test-session',
  status: 'running',
  messages: [],
  toolManifestMap: {},
  stepCount: 0,
  usage: {
    llm: { apiCalls: 0, processingTimeMs: 0, tokens: { input: 0, output: 0, total: 0 } },
    tools: { totalCalls: 0, totalTimeMs: 0, byTool: [] },
    humanInteraction: {
      approvalRequests: 0,
      promptRequests: 0,
      selectRequests: 0,
      totalWaitingTimeMs: 0,
    },
  },
  cost: {
    calculatedAt: new Date().toISOString(),
    currency: 'USD',
    llm: { byModel: [], currency: 'USD', total: 0 },
    tools: { byTool: [], currency: 'USD', total: 0 },
    total: 0,
  },
  createdAt: new Date().toISOString(),
  lastModified: new Date().toISOString(),
  ...overrides,
});

const createMockContext = (
  phase: AgentRuntimeContext['phase'],
  payload?: unknown,
): AgentRuntimeContext => ({
  phase,
  payload,
  session: {
    sessionId: 'graph-test-session',
    messageCount: 0,
    status: 'running',
    stepCount: 0,
  },
});

const testGraph: ReasoningGraph = {
  entry: 'inspection',
  maxBacktracks: 2,
  name: 'test-graph',
  states: {
    inspection: {
      maxAgentSteps: 2,
      outputSchema: {
        additionalProperties: false,
        properties: { plan: { type: 'string' } },
        required: ['plan'],
        type: 'object',
      },
      prompt: 'Inspect',
      type: 'agent',
    },
    working: {
      outputSchema: {
        additionalProperties: false,
        properties: { summary: { type: 'string' } },
        required: ['summary'],
        type: 'object',
      },
      prompt: 'Work',
      type: 'agent',
    },
    verification: {
      outputSchema: {
        additionalProperties: false,
        properties: {
          decision: { enum: ['accept', 'needs_work'], type: 'string' },
          reason: { type: 'string' },
        },
        required: ['decision', 'reason'],
        type: 'object',
      },
      prompt: 'Verify',
      type: 'agent',
    },
  },
  terminal: 'verification',
  transitions: [
    { condition: 'true', from: 'inspection', to: 'working' },
    { condition: 'true', from: 'working', to: 'verification' },
    { condition: 'output.decision === "needs_work"', from: 'verification', to: 'working' },
  ],
};

describe('GraphAgent', () => {
  afterEach(() => {
    delete process.env.TB_GRAPH_EXIT_AFTER;
  });

  it('finishes early after a configured node completes and preserves structured output', async () => {
    process.env.TB_GRAPH_EXIT_AFTER = 'inspection';

    const agent = new GraphAgent({
      agentConfig: { maxSteps: 100 },
      graph: testGraph,
      operationId: 'graph-test-session',
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const state = createMockState({
      messages: [{ role: 'assistant', content: '{"plan":"inspect the repo"}' }] as any,
      metadata: {
        [GRAPH_CONTEXT_KEY]: {
          backtrackCount: 0,
          currentNode: 'inspection',
          extracting: true,
          input: 'Solve the task',
          nodeActive: true,
          store: {},
          visitCount: { inspection: 1 },
        },
      },
    });

    const result = await agent.runner(createMockContext('llm_result'), state);

    expect(result).toEqual({
      reason: 'completed',
      reasonDetail:
        'Graph "test-graph" exited early after node "inspection" via TB_GRAPH_EXIT_AFTER',
      type: 'finish',
    });
    expect((state.metadata as any)[GRAPH_CONTEXT_KEY].store).toEqual({
      inspection: { plan: 'inspect the repo' },
    });
    expect((state.metadata as any)[GRAPH_CONTEXT_KEY].nodeActive).toBe(false);
  });

  it('starts extraction when an agent node reaches its step budget', async () => {
    const agent = new GraphAgent({
      agentConfig: { maxSteps: 100 },
      graph: testGraph,
      operationId: 'graph-test-session',
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const state = createMockState({
      messages: [
        { role: 'user', content: 'Inspect' },
        { role: 'assistant', content: 'I found partial evidence.' },
      ] as any,
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
      metadata: {
        [GRAPH_CONTEXT_KEY]: {
          backtrackCount: 0,
          currentNode: 'inspection',
          extracting: false,
          input: 'Solve the task',
          nodeActive: true,
          nodeStartStepCount: 3,
          store: {},
          visitCount: { inspection: 1 },
        },
      },
      stepCount: 5,
    });

    const result = await agent.runner(createMockContext('tool_result'), state);

    expect(result).toMatchObject({
      payload: {
        model: 'gpt-4o-mini',
        provider: 'openai',
        tools: [],
      },
      stepLabel: 'inspection:extract',
      type: 'call_llm',
    });
    expect((result as any).payload.messages.at(-1).content).toContain('reached its step budget');
    expect((state.metadata as any)[GRAPH_CONTEXT_KEY].extracting).toBe(true);
    expect((state.metadata as any)[GRAPH_CONTEXT_KEY].nodeStepLimitExceeded).toBe(true);
  });
});
