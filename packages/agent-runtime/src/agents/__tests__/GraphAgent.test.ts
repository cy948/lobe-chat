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
          checks: { type: 'array' },
          decision: { enum: ['accept', 'needs_work'], type: 'string' },
        },
        required: ['decision', 'checks'],
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
    {
      clearNodes: ['working'],
      condition: 'output.decision === "needs_work"',
      from: 'verification',
      handoff: { fields: ['checks'] },
      to: 'working',
    },
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
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
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

  it('retries incomplete extraction until it can read a decision value', async () => {
    process.env.TB_GRAPH_EXIT_AFTER = 'inspection';

    const agent = new GraphAgent({
      agentConfig: { maxSteps: 100 },
      graph: testGraph,
      operationId: 'graph-test-session',
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const state = createMockState({
      messages: [
        {
          role: 'assistant',
          content:
            '```json\n{"checks":[{"contract":"x","status":"unsatisfied","note":"missing"}]}\n```',
        },
      ] as any,
      metadata: {
        [GRAPH_CONTEXT_KEY]: {
          backtrackCount: 0,
          currentNode: 'inspection',
          extracting: true,
          extractionAttempts: 1,
          input: 'Solve the task',
          nodeActive: true,
          store: {},
          visitCount: { inspection: 1 },
        },
      },
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const result = await agent.runner(createMockContext('llm_result'), state);

    expect(result).toMatchObject({
      payload: {
        model: 'gpt-4o-mini',
        provider: 'openai',
        tools: [],
      },
      stepLabel: 'inspection:extract',
      type: 'call_llm',
    });
    expect((state.metadata as any)[GRAPH_CONTEXT_KEY].extractionAttempts).toBe(2);
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
    expect((result as any).payload.messages.at(-1).content).toContain('reached its action budget');
    expect((result as any).payload.messages.at(-1).content).toContain('Do not request tools');
    expect((result as any).payload.messages.at(-1).content).toContain(
      'This extraction step has no tools available',
    );
    expect((result as any).payload.messages.at(-1).content).toContain(
      'brief natural-language explanation',
    );
    expect((result as any).payload.messages.at(-1).content).toContain(
      'markdown fenced code block tagged json',
    );
    expect((result as any).payload.messages.at(-1).content).not.toContain(
      'Only output valid JSON, no other text.',
    );
    expect((state.metadata as any)[GRAPH_CONTEXT_KEY].extracting).toBe(true);
    expect((state.metadata as any)[GRAPH_CONTEXT_KEY].nodeStepLimitExceeded).toBe(true);
  });

  it('retries extraction until it can read a decision value', async () => {
    const agent = new GraphAgent({
      agentConfig: { maxSteps: 100 },
      graph: testGraph,
      operationId: 'graph-test-session',
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const state = createMockState({
      messages: [
        {
          role: 'assistant',
          content:
            '```json\n{"checks":[{"contract":"x","status":"unsatisfied","note":"missing"}]}\n```',
        },
      ] as any,
      metadata: {
        [GRAPH_CONTEXT_KEY]: {
          backtrackCount: 0,
          currentNode: 'verification',
          extracting: true,
          extractionAttempts: 1,
          input: 'Solve the task',
          nodeActive: true,
          store: {
            inspection: { plan: 'inspect the repo' },
            working: { summary: 'claimed complete' },
          },
          visitCount: { inspection: 1, verification: 1, working: 1 },
        },
      },
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const result = await agent.runner(createMockContext('llm_result'), state);

    expect(result).toMatchObject({
      payload: {
        model: 'gpt-4o-mini',
        provider: 'openai',
        tools: [],
      },
      stepLabel: 'verification:extract',
      type: 'call_llm',
    });
    expect((state.metadata as any)[GRAPH_CONTEXT_KEY].extractionAttempts).toBe(2);
  });

  it('finishes with error recovery after extraction exhausts retry attempts', async () => {
    const agent = new GraphAgent({
      agentConfig: { maxSteps: 100 },
      graph: testGraph,
      operationId: 'graph-test-session',
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const state = createMockState({
      messages: [{ role: 'assistant', content: '```json\n{"checks":[]}\n```' }] as any,
      metadata: {
        [GRAPH_CONTEXT_KEY]: {
          backtrackCount: 0,
          currentNode: 'verification',
          extracting: true,
          extractionAttempts: 3,
          input: 'Solve the task',
          nodeActive: true,
          store: {},
          visitCount: { inspection: 1, verification: 1, working: 1 },
        },
      },
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const result = await agent.runner(createMockContext('llm_result'), state);

    expect(result).toMatchObject({
      reason: 'error_recovery',
      type: 'finish',
    });
    expect((state.metadata as any)[GRAPH_CONTEXT_KEY].store.verification).toEqual({ checks: [] });
  });

  it('appends raw fallback contexts once per node when referenced fields are missing', async () => {
    const graph: ReasoningGraph = {
      entry: 'inspection',
      maxBacktracks: 0,
      name: 'raw-fallback-graph',
      states: {
        inspection: {
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
            type: 'llm',
          },
          prompt:
            'Use {{inspection.plan}} and {{inspection.summary}} and {{inspection._raw}} to continue.',
          type: 'llm',
        },
      },
      terminal: 'working',
      transitions: [{ condition: 'true', from: 'inspection', to: 'working' }],
    };

    const agent = new GraphAgent({
      agentConfig: { maxSteps: 100 },
      graph,
      operationId: 'graph-test-session',
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const state = createMockState({
      metadata: {
        [GRAPH_CONTEXT_KEY]: {
          backtrackCount: 0,
          currentNode: 'working',
          extracting: false,
          input: 'Solve the task',
          nodeActive: false,
          store: {
            inspection: {
              _raw: 'raw inspection result',
            },
          },
          visitCount: { inspection: 1, working: 1 },
        },
      },
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const result = await agent.runner(createMockContext('init'), state);

    expect(result).toMatchObject({
      payload: {
        model: 'gpt-4o-mini',
        provider: 'openai',
        tools: [],
      },
      stepLabel: 'working',
      type: 'call_llm',
    });

    const prompt = (result as any).payload.messages.at(-1).content;

    expect(prompt).toContain('<missing_field node="inspection" field="plan" />');
    expect(prompt).toContain('<missing_field node="inspection" field="summary" />');
    expect(prompt).toContain(
      '<raw_contexts>\n<raw_fields node="inspection">\nraw inspection result\n</raw_fields>\n</raw_contexts>',
    );
    expect(prompt.match(/<raw_fields node="inspection">/g)).toHaveLength(1);
    expect(prompt.indexOf('<missing_field node="inspection" field="summary" />')).toBeLessThan(
      prompt.indexOf('<raw_contexts>'),
    );
  });

  it('passes explicit transition handoff to a backtracked node and clears declared stale nodes', async () => {
    const graph: ReasoningGraph = {
      entry: 'inspection',
      maxBacktracks: 2,
      name: 'handoff-backtrack-graph',
      states: {
        inspection: {
          outputSchema: {
            additionalProperties: false,
            properties: { intent: { type: 'string' } },
            required: ['intent'],
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
          prompt: 'Work with intent {{inspection.intent}} and feedback {{handoff.output}}.',
          type: 'agent',
        },
        verification: {
          outputSchema: {
            additionalProperties: false,
            properties: {
              checks: { type: 'array' },
              decision: { enum: ['accept', 'needs_work'], type: 'string' },
            },
            required: ['decision', 'checks'],
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
        {
          clearNodes: ['working'],
          condition: 'output.decision === "needs_work"',
          from: 'verification',
          handoff: { fields: ['checks'] },
          to: 'working',
        },
      ],
    };

    const agent = new GraphAgent({
      agentConfig: { maxSteps: 100 },
      graph,
      operationId: 'graph-test-session',
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const checks = [
      {
        contract: 'serve on port 8080',
        note: 'No process is listening on 8080.',
        status: 'unsatisfied',
      },
    ];

    const state = createMockState({
      messages: [
        { role: 'assistant', content: JSON.stringify({ checks, decision: 'needs_work' }) },
      ] as any,
      metadata: {
        [GRAPH_CONTEXT_KEY]: {
          backtrackCount: 0,
          currentNode: 'verification',
          extracting: true,
          input: 'Serve the app on port 8080',
          nodeActive: true,
          store: {
            inspection: { intent: 'serve the app' },
            working: { summary: 'claimed complete' },
          },
          visitCount: { inspection: 1, verification: 1, working: 1 },
        },
      },
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const result = await agent.runner(createMockContext('llm_result'), state);

    expect(result).toMatchObject({
      stepLabel: 'working',
      type: 'call_llm',
    });

    const graphContext = (state.metadata as any)[GRAPH_CONTEXT_KEY];
    expect(graphContext.store.inspection).toEqual({ intent: 'serve the app' });
    expect(graphContext.store.working).toBeUndefined();
    expect(graphContext.store.verification).toEqual({ checks, decision: 'needs_work' });
    expect(graphContext.handoff).toEqual({
      from: 'verification',
      output: { checks },
      to: 'working',
    });

    const prompt = (result as any).payload.messages.at(-1).content;
    expect(prompt).toContain('serve the app');
    expect(prompt).toContain('serve on port 8080');
    expect(prompt).toContain('No process is listening on 8080.');
    expect(prompt).not.toContain('claimed complete');
  });
});
