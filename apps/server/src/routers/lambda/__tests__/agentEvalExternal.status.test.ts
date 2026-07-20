import { describe, expect, it } from 'vitest';

import { resolveRunStatus } from '../agentEvalExternal';

describe('resolveRunStatus', () => {
  it('returns external when any topic still awaits external eval', () => {
    expect(
      resolveRunStatus({ completedCases: 9, errorCases: 0, timeoutCases: 0, totalCases: 9 }, true),
    ).toBe('external');
  });

  it('returns running while cases are still outstanding (partial execution)', () => {
    // Regression: a partially executed external run must not flip to
    // completed/failed just because the executed cases are all evaluated.
    expect(
      resolveRunStatus({ completedCases: 3, errorCases: 0, timeoutCases: 0, totalCases: 9 }, false),
    ).toBe('running');
  });

  it('returns failed when every case errored or timed out', () => {
    expect(
      resolveRunStatus({ completedCases: 4, errorCases: 3, timeoutCases: 1, totalCases: 4 }, false),
    ).toBe('failed');
  });

  it('returns completed when all cases are done and at least one succeeded', () => {
    expect(
      resolveRunStatus({ completedCases: 4, errorCases: 1, timeoutCases: 0, totalCases: 4 }, false),
    ).toBe('completed');
  });

  it('prefers external over the other states', () => {
    expect(
      resolveRunStatus({ completedCases: 2, errorCases: 2, timeoutCases: 0, totalCases: 9 }, true),
    ).toBe('external');
  });
});
