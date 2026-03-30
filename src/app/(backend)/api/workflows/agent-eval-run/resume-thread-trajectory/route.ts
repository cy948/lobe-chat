import { serve } from '@upstash/workflow/nextjs';
import debug from 'debug';

import { getServerDB } from '@/database/server';
import { qstashClient } from '@/libs/qstash';
import { AgentEvalRunService } from '@/server/services/agentEvalRun';
import {
  AgentEvalRunWorkflow,
  type ResumeThreadTrajectoryPayload,
} from '@/server/workflows/agentEvalRun';

const log = debug('lobe-server:workflows:resume-thread-trajectory');

export const { POST } = serve<ResumeThreadTrajectoryPayload>(
  async (context) => {
    const payload = context.requestPayload ?? {};
    const { runId, testCaseId, threadId, topicId, userId } = payload;

    log('Starting: runId=%s testCaseId=%s threadId=%s', runId, testCaseId, threadId);

    if (
      !runId ||
      !testCaseId ||
      !threadId ||
      !topicId ||
      !userId ||
      !payload.parentMessageId ||
      !payload.appContext?.topicId ||
      !payload.appContext?.threadId
    ) {
      return { error: 'Missing required parameters', success: false };
    }

    const db = await getServerDB();
    const service = new AgentEvalRunService(db, userId);

    const result = await context.run('resume-thread-trajectory:exec-agent', () =>
      service.executeResumedThreadTrajectory(payload),
    );

    if (result.status === 'cancelled') {
      log(
        'Resume cancelled during execution: runId=%s testCaseId=%s threadId=%s reason=%s',
        runId,
        testCaseId,
        threadId,
        result.reason,
      );
      return { cancelled: true, reason: result.reason, testCaseId, threadId, topicId };
    }

    if (result.status === 'error') {
      await context.run('resume-thread-trajectory:handle-exec-error', async () => {
        const { allRunDone } = await service.recordThreadCompletion({
          runId,
          status: 'error',
          telemetry: { completionReason: 'error', errorMessage: result.error },
          testCaseId,
          threadId,
          topicId,
        });

        if (allRunDone) {
          log('All test cases done after resume exec error, triggering finalize: runId=%s', runId);
          await AgentEvalRunWorkflow.triggerFinalizeRun({ runId, userId });
        }
      });

      return { error: result.error, success: false, testCaseId, threadId };
    }

    log(
      'Resumed thread agent started: runId=%s testCaseId=%s threadId=%s',
      runId,
      testCaseId,
      threadId,
    );

    return { success: true, testCaseId, threadId, topicId };
  },
  {
    flowControl: {
      key: 'agent-eval-run.resume-thread-trajectory',
      parallelism: 500,
      ratePerSecond: 20,
    },
    qstashClient,
  },
);
