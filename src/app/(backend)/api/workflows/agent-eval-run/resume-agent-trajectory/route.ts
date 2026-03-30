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

    const data = await context.run('resume-agent-trajectory:load-data', () =>
      service.loadTrajectoryData(runId, testCaseId),
    );

    if ('error' in data) {
      const errorMessage = data.error ?? 'Load trajectory data failed';

      await context.run('resume-agent-trajectory:handle-load-error', async () => {
        await service.markResumeLoadError({
          errorMessage,
          runId,
          testCaseId,
          topicId: topicId!,
        });
      });

      return { error: errorMessage, success: false };
    }

    if (data.run.status === 'aborted') {
      log('Run aborted, skipping: runId=%s testCaseId=%s', runId, testCaseId);
      return { cancelled: true };
    }

    const result = await context.run('resume-agent-trajectory:exec-agent', () =>
      service.executeResumedTrajectory(payload),
    );

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
