export const workingSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description:
        'Concise natural-language summary of the work performed and the current task state.',
    },
    closure_state: {
      type: 'object',
      description:
        'Structured working-side closure state for verification. Preserve the current strongest progress, the single most important live blocker, and concrete results that later passes must not regress.',
      properties: {
        best_known_state: {
          type: 'string',
          description: 'Current strongest progress or closest-to-success state achieved so far.',
        },
        live_blocker: {
          type: 'string',
          description: 'Single most important issue currently blocking acceptance.',
        },
        must_preserve: {
          type: 'array',
          description:
            'Concrete results, artifacts, or established facts that later passes must preserve. If nothing stable exists yet, say that explicitly as one item instead of leaving this empty.',
          items: {
            type: 'string',
          },
          minItems: 1,
        },
      },
      required: ['best_known_state', 'live_blocker', 'must_preserve'],
      additionalProperties: false,
    },
  },
  required: ['summary', 'closure_state'],
  additionalProperties: false,
};
