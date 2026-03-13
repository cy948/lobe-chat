import { serve } from '@upstash/workflow/nextjs';

import { getServerDB } from '@/database/server';
import { qstashClient } from '@/libs/qstash';
import { AgentEvalRunService } from '@/server/services/agentEvalRun';
import { type ResumeTimeoutCasePayload } from '@/server/workflows/agentEvalRun';

export const { POST } = serve<ResumeTimeoutCasePayload>(
  async (context) => {
    const { runId, testCaseId, userId } = context.requestPayload ?? {};

    if (!runId || !testCaseId || !userId) {
      return { error: 'Missing required parameters', success: false };
    }

    const db = await getServerDB();
    const service = new AgentEvalRunService(db, userId);
    const result = await context.run('agent-eval-run:resume-timeout-case', () =>
      service.resumeTimeoutCase(runId, testCaseId),
    );

    return { ...result, success: true };
  },
  {
    flowControl: {
      key: 'agent-eval-run.resume-timeout-case',
      parallelism: 200,
      ratePerSecond: 5,
    },
    qstashClient,
  },
);
