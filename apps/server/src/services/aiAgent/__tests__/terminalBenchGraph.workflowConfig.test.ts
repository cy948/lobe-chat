import { describe, expect, it } from 'vitest';

import { terminalBenchGraph } from '../terminalBenchGraph';
import { inspectionPrompt } from '../workflowConfig/inspection.prompt';
import { inspectionSchema } from '../workflowConfig/inspection.schema';
import { verificationPrompt } from '../workflowConfig/verification.prompt';
import { verificationSchema } from '../workflowConfig/verification.schema';
import { workingPrompt } from '../workflowConfig/working.prompt';

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
  });

  it('gives working a short field-semantics interpretation preface', () => {
    expect(workingPrompt).toContain('Interpret the inspection fields as follows');
    expect(workingPrompt).toContain('handoff.confirmed contains established facts only');
    expect(workingPrompt).toContain('handoff.candidates contains tentative routes');
    expect(workingPrompt).toContain('Contract boundaries are binding');
    expect(workingPrompt).not.toContain('Use status "satisfied"');
  });

  it('teaches verification to require explicit boundary coverage', () => {
    expect(verificationPrompt).toContain('bounded edit');
    expect(verificationPrompt).toContain(
      'If that boundary was not directly checked, do not mark the overall requirement satisfied',
    );
    expect(verificationPrompt).toContain('no-unrelated-change boundary');

    const checks = (verificationSchema.properties as any).checks;
    expect(checks.description).toContain('no-unrelated-change boundaries');
    expect(checks.items.properties.note.description).toContain('unrelated-file-change');
  });
});
