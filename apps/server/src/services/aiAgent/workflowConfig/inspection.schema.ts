export const inspectionSchema = {
  type: 'object',
  properties: {
    intent: { type: 'string' },
    subgoals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: {
            type: 'string',
            enum: [
              'delivery_contract',
              'direct_action',
              'exploration_goal',
              'performance_target',
              'working_only_unknown',
            ],
          },
          description: { type: 'string' },
          relevant_files: {
            type: 'array',
            items: { type: 'string' },
          },
          handoff_note: { type: 'string' },
        },
        required: ['name', 'type', 'description', 'relevant_files', 'handoff_note'],
        additionalProperties: false,
      },
    },
  },
  required: ['intent', 'subgoals'],
  additionalProperties: false,
};
