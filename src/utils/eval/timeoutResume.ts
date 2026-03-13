export interface TimeoutResumeDecisionParams {
  durationMs?: number | null;
  status?: string | null;
  timeoutMs: number;
}

export const getTimeoutResumeDecision = ({
  durationMs,
  status,
  timeoutMs,
}: TimeoutResumeDecisionParams) => {
  if (status !== 'timeout') {
    return {
      durationMs,
      eligible: false,
      reason: `status=${status ?? 'unknown'}`,
      timeoutMs,
    };
  }

  if (durationMs === undefined || durationMs === null) {
    return {
      durationMs,
      eligible: false,
      reason: 'missing_timeout_duration',
      timeoutMs,
    };
  }

  if (durationMs > timeoutMs) {
    return {
      durationMs,
      eligible: false,
      reason: 'timeout_exceeded',
      timeoutMs,
    };
  }

  return {
    durationMs,
    eligible: true,
    reason: undefined,
    timeoutMs,
  };
};
