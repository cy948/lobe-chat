import type { AgentRuntimeContext, AgentState } from '@lobechat/agent-runtime';
import { GraphAgent } from '@lobechat/agent-runtime';
import { describe, expect, it } from 'vitest';

import { terminalBenchGraph } from '../terminalBenchGraph';
import { inspectionPrompt } from '../workflowConfig/inspection.prompt';
import { inspectionSchema } from '../workflowConfig/inspection.schema';
import { verificationPrompt } from '../workflowConfig/verification.prompt';
import { verificationSchema } from '../workflowConfig/verification.schema';
import { workingPrompt } from '../workflowConfig/working.prompt';

const GRAPH_CONTEXT_KEY = '__graphContext';

const createMockState = (overrides?: Partial<AgentState>): AgentState =>
  ({
    operationId: 'terminal-bench-graph-test',
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
  }) as AgentState;

const createMockContext = (phase: AgentRuntimeContext['phase']): AgentRuntimeContext =>
  ({
    phase,
    session: {
      sessionId: 'terminal-bench-graph-test',
      messageCount: 0,
      status: 'running',
      stepCount: 0,
    },
  }) as AgentRuntimeContext;

describe('terminalBenchGraph workflow config', () => {
  it('keeps inspection maxAgentSteps at 20', () => {
    expect(terminalBenchGraph.states.inspection.type).toBe('agent');
    expect(terminalBenchGraph.states.inspection.maxAgentSteps).toBe(20);
  });

  it('uses structured handoff fields in the inspection schema', () => {
    const subgoal = (inspectionSchema.properties as any).subgoals.items;

    expect(subgoal.required).toContain('handoff');
    expect(subgoal.required).not.toContain('handoff_note');
    expect(subgoal.properties.handoff).toBeDefined();
    expect(subgoal.properties.handoff.required).toEqual(['confirmed', 'candidates', 'risks']);
  });

  it('teaches inspection to emit the structured handoff', () => {
    expect(inspectionPrompt).toContain('handoff.confirmed / handoff.candidates / handoff.risks');
    expect(inspectionPrompt).toContain('In handoff.confirmed');
    expect(inspectionPrompt).toContain('In handoff.candidates');
    expect(inspectionPrompt).toContain('In handoff.risks');
    expect(inspectionPrompt).toContain('do not modify unrelated files');
    expect(inspectionPrompt).toContain('multiple plausible contract interpretations');
  });

  it('gives working a short field-semantics interpretation preface', () => {
    expect(workingPrompt).toContain('Interpret the inspection fields as follows');
    expect(workingPrompt).toContain('handoff.confirmed contains established facts only');
    expect(workingPrompt).toContain('handoff.candidates contains tentative routes');
    expect(workingPrompt).toContain('Contract boundaries are binding');
    expect(workingPrompt).toContain('Interpret verification feedback as follows');
    expect(workingPrompt).toContain(
      'feedback.preserve lists results that still hold and must be kept',
    );
    expect(workingPrompt).toContain(
      'feedback.blocking_gap names the main gap currently blocking accept',
    );
    expect(workingPrompt).toContain('feedback.evidence_needed names the direct evidence');
    expect(workingPrompt).toContain(
      'which prior route, interpretation, or assumption is no longer trustworthy',
    );
  });

  it('teaches verification to require explicit boundary coverage', () => {
    expect(verificationPrompt).toContain('bounded edit');
    expect(verificationPrompt).toContain(
      'If that boundary was not directly checked, do not mark the overall requirement satisfied',
    );
    expect(verificationPrompt).toContain('no-unrelated-change boundary');
    expect(verificationPrompt).toContain('multiple plausible interpretations of source_of_truth');

    const checks = (verificationSchema.properties as any).checks;
    expect(checks.description).toContain('no-unrelated-change boundaries');
    expect(checks.description).toContain('unresolved ambiguity');
    expect(checks.items.properties.note.description).toContain('unrelated-file-change');
    expect(checks.items.properties.note.description).toContain('unresolved ambiguity');
  });

  it('backtracks from verification to working when decision is needs_work', async () => {
    const agent = new GraphAgent({
      agentConfig: { maxSteps: 100 },
      graph: terminalBenchGraph as any,
      operationId: 'terminal-bench-graph-test',
      modelRuntimeConfig: { model: 'gpt-4o-mini', provider: 'openai' },
    });

    const feedback = {
      blocking_gap: 'Still missing direct proof.',
      evidence_needed: 'Run the decisive verification.',
      preserve: ['Keep the existing artifact.'],
    };

    const state = createMockState({
      messages: [
        {
          role: 'assistant',
          content: JSON.stringify({
            checks: [
              {
                contract: 'direct verification',
                note: 'No direct observed proof yet.',
                status: 'unknown',
              },
            ],
            decision: 'needs_work',
            feedback,
          }),
        },
      ] as any,
      metadata: {
        [GRAPH_CONTEXT_KEY]: {
          backtrackCount: 0,
          currentNode: 'verification',
          extracting: true,
          input: 'Finish the task',
          nodeActive: true,
          store: {
            inspection: {
              intent: 'finish the task',
              subgoals: [],
            },
            working: {
              closure_state: {
                best_known_state: 'Partial progress',
                live_blocker: 'Need direct proof',
                must_preserve: ['Existing artifact'],
              },
              summary: 'Claimed done',
            },
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
    expect(graphContext.store.working).toBeUndefined();
    expect(graphContext.handoff).toEqual({
      from: 'verification',
      output: { feedback },
      to: 'working',
    });
  });
});
