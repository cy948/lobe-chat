import { describe, expect, it } from 'vitest';

import { type AgentInstruction, type AgentRuntimeContext, type AgentState } from '../../types';
import { GraphAgent } from '../GraphAgent';

const graph = {
  name: 'test-graph',
  entry: 'inspect',
  terminal: 'final_review',
  maxBacktracks: 2,
  states: {
    inspect: {
      type: 'agent' as const,
      prompt: 'Inspect {{input.question}}',
      outputSchema: {
        type: 'object',
        properties: {
          findings: { type: 'array', items: { type: 'string' } },
        },
        required: ['findings'],
      },
    },
    plan: {
      type: 'llm' as const,
      prompt: 'Plan from {{inspect.findings}}',
      outputSchema: {
        type: 'object',
        properties: {
          steps: { type: 'array', items: { type: 'string' } },
        },
        required: ['steps'],
      },
    },
    working_loop: {
      type: 'agent' as const,
      prompt: 'Work from {{plan.steps}} after {{working_loop.summary}}',
      outputSchema: {
        type: 'object',
        properties: {
          current_goal: { type: 'string' },
          action_taken: { type: 'string' },
          verification_done: { type: 'string' },
          findings: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['continue', 'ready_for_final', 'blocked'] },
          next_goal: { type: 'string' },
          summary: { type: 'string' },
        },
        required: [
          'current_goal',
          'action_taken',
          'verification_done',
          'findings',
          'status',
          'next_goal',
          'summary',
        ],
      },
    },
    final_review: {
      type: 'llm' as const,
      prompt: 'Finish from {{working_loop.summary}}',
      outputSchema: {
        type: 'object',
        properties: {
          ready_to_finish: { type: 'boolean' },
        },
        required: ['ready_to_finish'],
      },
    },
  },
  transitions: [
    {
      from: 'working_loop',
      to: 'working_loop',
      condition: 'output.status === "continue"',
    },
    {
      from: 'working_loop',
      to: 'final_review',
      condition: 'output.status === "ready_for_final" || output.status === "blocked"',
    },
    {
      from: 'final_review',
      to: 'working_loop',
      condition: 'output.ready_to_finish === false',
    },
  ],
};

const createState = (): AgentState => ({
  operationId: 'test-operation',
  status: 'running',
  messages: [{ role: 'user', content: 'solve the task' }],
  toolManifestMap: {},
  tools: [{ type: 'function', function: { name: 'read_file', parameters: {} } }],
  stepCount: 0,
  modelRuntimeConfig: {
    model: 'test-model',
    provider: 'test-provider',
  },
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
});

const context = (phase: AgentRuntimeContext['phase'], payload?: unknown): AgentRuntimeContext => ({
  phase,
  payload,
  session: {
    sessionId: 'test-operation',
    messageCount: 0,
    status: 'running',
    stepCount: 0,
  },
});

const appendAssistantJson = (state: AgentState, value: Record<string, unknown>) => {
  state.messages.push({
    role: 'assistant',
    content: JSON.stringify(value),
  });
};

const expectCallLlm = (instruction: AgentInstruction | AgentInstruction[]) => {
  expect(Array.isArray(instruction)).toBe(false);
  expect((instruction as AgentInstruction).type).toBe('call_llm');
  return instruction as Extract<AgentInstruction, { type: 'call_llm' }>;
};

const expectFinish = (instruction: AgentInstruction | AgentInstruction[]) => {
  expect(Array.isArray(instruction)).toBe(false);
  expect((instruction as AgentInstruction).type).toBe('finish');
  return instruction as Extract<AgentInstruction, { type: 'finish' }>;
};

const latestPrompt = (instruction: Extract<AgentInstruction, { type: 'call_llm' }>) =>
  instruction.payload.messages.at(-1)?.content as string;

const finishAgentNode = async (agent: GraphAgent, state: AgentState) =>
  expectCallLlm(
    await agent.runner(
      context('llm_result', {
        hasToolsCalling: false,
        parentMessageId: 'assistant-message',
        toolsCalling: [],
      }),
      state,
    ),
  );

const completeExtraction = async (
  agent: GraphAgent,
  state: AgentState,
  output: Record<string, unknown>,
) => {
  appendAssistantJson(state, output);
  return expectCallLlm(await agent.runner(context('llm_result'), state));
};

const completeLlmNode = async (
  agent: GraphAgent,
  state: AgentState,
  output: Record<string, unknown>,
) => {
  appendAssistantJson(state, output);
  return await agent.runner(context('llm_result'), state);
};

const completeAgentNode = async (
  agent: GraphAgent,
  state: AgentState,
  output: Record<string, unknown>,
) => {
  const extractionInstruction = await finishAgentNode(agent, state);
  expect(extractionInstruction.stepLabel).toMatch(/:extract$/);
  return completeExtraction(agent, state, output);
};

const createAgent = () =>
  new GraphAgent({
    agentConfig: { maxSteps: 100 },
    graph,
    modelRuntimeConfig: {
      model: 'test-model',
      provider: 'test-provider',
    },
    operationId: 'test-operation',
  });

const loopOutput = (overrides: Partial<Record<string, unknown>> = {}) => ({
  current_goal: 'make local progress',
  action_taken: 'changed code',
  verification_done: 'ran a focused check',
  findings: ['check completed'],
  status: 'ready_for_final',
  next_goal: '',
  summary: 'local goal completed and checked',
  ...overrides,
});

describe('GraphAgent control flow', () => {
  it('runs the happy path to the terminal node and finishes', async () => {
    const agent = createAgent();
    const state = createState();

    const inspect = expectCallLlm(await agent.runner(context('init'), state));
    expect(inspect.stepLabel).toBe('inspect');
    expect(inspect.payload.tools).toBe(state.tools);

    const plan = await completeAgentNode(agent, state, { findings: ['repo has tests'] });
    expect(plan.stepLabel).toBe('plan');
    expect(plan.payload.tools).toEqual([]);
    expect(latestPrompt(plan)).toContain('Graph phase context:');
    expect(latestPrompt(plan)).toContain('Current phase: plan');
    expect(latestPrompt(plan)).toContain('Formal phase boundary: yes');
    expect(latestPrompt(plan)).toContain('"from":"inspect"');
    expect(latestPrompt(plan)).toContain('"to":"plan"');
    expect(latestPrompt(plan)).toContain('"findings":["repo has tests"]');

    const workingLoop = expectCallLlm(
      await completeLlmNode(agent, state, { steps: ['change code'] }),
    );
    expect(workingLoop.stepLabel).toBe('working_loop');

    const final = await completeAgentNode(agent, state, loopOutput());
    expect(final.stepLabel).toBe('final_review');
    expect(latestPrompt(final)).toContain('Original accepted plan anchor:');
    expect(latestPrompt(final)).toContain('"from":"plan"');
    expect(latestPrompt(final)).toContain('"steps":["change code"]');

    const finish = expectFinish(await completeLlmNode(agent, state, { ready_to_finish: true }));
    expect(finish.reason).toBe('completed');
    expect(finish.reasonDetail).toContain('completed at terminal node "final_review"');
  });

  it('extracts only the current graph phase artifact after an agent node finishes', async () => {
    const agent = createAgent();
    const state = createState();

    expectCallLlm(await agent.runner(context('init'), state));
    const extraction = await finishAgentNode(agent, state);
    const prompt = latestPrompt(extraction);

    expect(prompt).toContain('current graph phase "inspect"');
    expect(prompt).not.toContain('research and information gathered above');
  });

  it('routes continuing micro-iterations back to the working loop', async () => {
    const agent = createAgent();
    const state = createState();

    expectCallLlm(await agent.runner(context('init'), state));
    expect((await completeAgentNode(agent, state, { findings: ['finding'] })).stepLabel).toBe(
      'plan',
    );
    expect(expectCallLlm(await completeLlmNode(agent, state, { steps: ['step'] })).stepLabel).toBe(
      'working_loop',
    );

    const next = await completeAgentNode(
      agent,
      state,
      loopOutput({
        status: 'continue',
        next_goal: 'run a stronger check',
        summary: 'first local goal needs another focused iteration',
      }),
    );

    expect(next.stepLabel).toBe('working_loop');
  });

  it('routes rejected final review back to the working loop', async () => {
    const agent = createAgent();
    const state = createState();

    expectCallLlm(await agent.runner(context('init'), state));
    expect((await completeAgentNode(agent, state, { findings: ['finding'] })).stepLabel).toBe(
      'plan',
    );
    expect(expectCallLlm(await completeLlmNode(agent, state, { steps: ['step'] })).stepLabel).toBe(
      'working_loop',
    );
    expect((await completeAgentNode(agent, state, loopOutput())).stepLabel).toBe('final_review');

    const next = expectCallLlm(await completeLlmNode(agent, state, { ready_to_finish: false }));

    expect(next.stepLabel).toBe('working_loop');
    expect(latestPrompt(next)).toContain('"from":"final_review"');
    expect(latestPrompt(next)).toContain('"to":"working_loop"');
    expect(latestPrompt(next)).toContain('"ready_to_finish":false');
  });

  it('falls through instead of looping forever after the backtrack cap is reached', async () => {
    const agent = createAgent();
    const state = createState();

    expectCallLlm(await agent.runner(context('init'), state));
    expect((await completeAgentNode(agent, state, { findings: ['finding'] })).stepLabel).toBe(
      'plan',
    );
    expect(expectCallLlm(await completeLlmNode(agent, state, { steps: ['step'] })).stepLabel).toBe(
      'working_loop',
    );

    expect(
      (
        await completeAgentNode(
          agent,
          state,
          loopOutput({
            action_taken: 'action-1',
            status: 'continue',
            next_goal: 'retry',
            summary: 'first iteration still needs work',
          }),
        )
      ).stepLabel,
    ).toBe('working_loop');

    expect(
      (
        await completeAgentNode(
          agent,
          state,
          loopOutput({
            action_taken: 'action-2',
            status: 'continue',
            next_goal: 'retry again',
            summary: 'second iteration still needs work',
          }),
        )
      ).stepLabel,
    ).toBe('working_loop');

    const final = await completeAgentNode(
      agent,
      state,
      loopOutput({
        action_taken: 'action-3',
        status: 'continue',
        next_goal: 'retry after cap',
        summary: 'third iteration would continue, but cap should fall through',
      }),
    );

    expect(final.stepLabel).toBe('final_review');
  });
});
