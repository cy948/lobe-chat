export const inspectionSchema = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      description:
        'Short stable task goal. Do not include commands, validation steps, or implementation details.',
    },
    subgoals: {
      type: 'array',
      description:
        'Structured handoff items anchored to authoritative task facts and confirmed read-only evidence. Do not broaden the task scope.',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Short stable label for the subgoal.',
          },
          type: {
            type: 'string',
            description:
              'Subgoal category. delivery_contract is immutable verifier-facing contract; direct_action is work for the next phase; exploration_goal is flexible strategy; performance_target is measurable outcome; working_only_unknown needs execution, mutation, validation, runtime observation, or tuning.',
            enum: [
              'delivery_contract',
              'direct_action',
              'exploration_goal',
              'performance_target',
              'working_only_unknown',
            ],
          },
          description: {
            type: 'string',
            description:
              'State the goal or constraint. Preserve hard paths, ports, APIs, output formats, behavior protocols, service lifetime, and known scope exactly when they are part of the task contract.',
          },
          relevant_files: {
            type: 'array',
            description:
              'Known relevant paths from the task or read-only evidence; use an empty list if none are known.',
            items: { type: 'string' },
          },
          handoff_note: {
            type: 'string',
            description:
              'Tell working what to preserve, do, test, or investigate. Distinguish confirmed facts from unresolved risks.',
          },
        },
        required: ['name', 'type', 'description', 'relevant_files', 'handoff_note'],
        additionalProperties: false,
      },
    },
  },
  required: ['intent', 'subgoals'],
  additionalProperties: false,
};
