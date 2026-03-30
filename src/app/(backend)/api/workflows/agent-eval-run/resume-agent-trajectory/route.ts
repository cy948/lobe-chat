import { serve } from '@upstash/workflow/nextjs';
import debug from 'debug';

import { getServerDB } from '@/database/server';
import { qstashClient } from '@/libs/qstash';
import { AgentEvalRunService } from '@/server/services/agentEvalRun';
import {
  AgentEvalRunWorkflow,
  type ResumeAgentTrajectoryPayload,
} from '@/server/workflows/agentEvalRun';

const log = debug('lobe-server:workflows:resume-agent-trajectory');

export const { POST } = serve<ResumeAgentTrajectoryPayload>(
  async (context) => {
    const payload = context.requestPayload ?? {};
    const { runId, testCaseId, topicId, userId } = payload;

    log('Starting: runId=%s testCaseId=%s', runId, testCaseId);

    if (
      !runId ||
      !testCaseId ||
      !topicId ||
      !userId ||
      !payload.parentMessageId ||
      !payload.appContext?.topicId
    ) {
      return { error: 'Missing required parameters', success: false };
    }

    const db = await getServerDB();
    const service = new AgentEvalRunService(db, userId);

    const resumeCheck = await context.run('resume-agent-trajectory:can-resume', () =>
      service.canResumeTrajectory({ runId, testCaseId }),
    );

    if (!resumeCheck.canResume) {
      log(
        'Resume cancelled: runId=%s testCaseId=%s reason=%s',
        runId,
        testCaseId,
        resumeCheck.reason,
      );
      return { cancelled: true, reason: resumeCheck.reason, testCaseId, topicId };
    }

    const result = await context.run('resume-agent-trajectory:exec-agent', () =>
      service.executeResumedTrajectory(payload),
    );

    if ('cancelled' in result) {
      log(
        'Resume cancelled during execution: runId=%s testCaseId=%s reason=%s',
        runId,
        testCaseId,
        result.reason,
      );
      return { cancelled: true, reason: result.reason, testCaseId, topicId };
    }

    if ('error' in result) {
      await context.run('resume-agent-trajectory:handle-exec-error', async () => {
        const { allDone } = await service.recordTrajectoryCompletion({
          runId,
          status: 'error',
          telemetry: { completionReason: 'error', errorMessage: result.error as string },
          testCaseId,
        });

        if (allDone) {
          log('All test cases done after resume exec error, triggering finalize: runId=%s', runId);
          await AgentEvalRunWorkflow.triggerFinalizeRun({ runId, userId });
        }
      });

      return { error: result.error, success: false, testCaseId, topicId };
    }

    log(
      'Resumed agent started (async): runId=%s testCaseId=%s topicId=%s',
      runId,
      testCaseId,
      topicId,
    );

    return { success: true, testCaseId, topicId };
  },
  {
    flowControl: {
      key: 'agent-eval-run.resume-agent-trajectory',
      parallelism: 500,
      ratePerSecond: 20,
    },
    qstashClient,
  },
);
