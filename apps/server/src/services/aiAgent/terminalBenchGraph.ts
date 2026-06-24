import type { ReasoningGraph } from '@lobechat/agent-runtime';

import { inspectionPrompt } from './workflowConfig/inspection.prompt';
import { inspectionSchema } from './workflowConfig/inspection.schema';
import { inspectionAllowedToolApiNames } from './workflowConfig/inspection.tools';
import { inspectionTransitions } from './workflowConfig/inspection.transitions';
import { verificationPrompt } from './workflowConfig/verification.prompt';
import { verificationSchema } from './workflowConfig/verification.schema';
import { verificationAllowedToolApiNames } from './workflowConfig/verification.tools';
import { verificationTransitions } from './workflowConfig/verification.transitions';
import { workingPrompt } from './workflowConfig/working.prompt';
import { workingSchema } from './workflowConfig/working.schema';
import { workingTransitions } from './workflowConfig/working.transitions';

export const terminalBenchGraph: ReasoningGraph = {
  name: 'cli-inspection-working-verification-v1',
  description:
    'Minimal CLI workflow template: inspect first, work against the environment, then verify whether to accept or return to working.',
  entry: 'inspection',
  terminal: 'verification',
  maxBacktracks: 4,
  states: {
    inspection: {
      type: 'agent',
      allowedToolApiNames: inspectionAllowedToolApiNames,
      maxAgentSteps: 20,
      prompt: inspectionPrompt,
      outputSchema: inspectionSchema,
    },
    working: {
      type: 'agent',
      prompt: workingPrompt,
      outputSchema: workingSchema,
    },
    verification: {
      type: 'agent',
      allowedToolApiNames: verificationAllowedToolApiNames,
      prompt: verificationPrompt,
      outputSchema: verificationSchema,
    },
  },
  transitions: [...inspectionTransitions, ...workingTransitions, ...verificationTransitions],
};
