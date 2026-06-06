import { describe, expect, it } from 'vitest';

import { terminalBenchGraph } from '../terminalBenchGraph';

describe('terminalBenchGraph', () => {
  it('defines a valid inspect-plan-micro-iteration flow', () => {
    expect(terminalBenchGraph.entry).toBe('inspect_environment');
    expect(terminalBenchGraph.terminal).toBe('final_review');
    expect(terminalBenchGraph.maxBacktracks).toBeGreaterThan(0);

    const stateIds = Object.keys(terminalBenchGraph.states);
    expect(stateIds).toEqual(['inspect_environment', 'make_plan', 'working_loop', 'final_review']);

    for (const [stateId, state] of Object.entries(terminalBenchGraph.states)) {
      expect(state.prompt, stateId).toEqual(expect.any(String));
      expect(state.outputSchema, stateId).toEqual(expect.objectContaining({ type: 'object' }));
    }

    for (const transition of terminalBenchGraph.transitions) {
      expect(terminalBenchGraph.states[transition.from], transition.from).toBeDefined();
      expect(terminalBenchGraph.states[transition.to], transition.to).toBeDefined();
      expect(transition.condition).toEqual(expect.any(String));
    }
  });

  it('keeps tool-capable and structured-only nodes separated', () => {
    expect(terminalBenchGraph.states.inspect_environment.type).toBe('agent');
    expect(terminalBenchGraph.states.working_loop.type).toBe('agent');

    expect(terminalBenchGraph.states.make_plan.type).toBe('llm');
    expect(terminalBenchGraph.states.final_review.type).toBe('llm');
  });

  it('exposes deterministic route inputs for the micro-loop and final review gates', () => {
    expect(terminalBenchGraph.states.working_loop.outputSchema.required).toEqual([
      'current_goal',
      'action_taken',
      'verification_done',
      'findings',
      'status',
      'next_goal',
      'summary',
    ]);
    expect(terminalBenchGraph.states.final_review.outputSchema.required).toEqual([
      'ready_to_finish',
      'final_summary',
      'remaining_risks',
      'next_goal',
      'confidence',
    ]);

    expect(terminalBenchGraph.transitions).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });
});
