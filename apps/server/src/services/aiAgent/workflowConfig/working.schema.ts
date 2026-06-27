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
        'Structured working-side closure state for verification. Preserve the current strongest surviving frontier, the single most important live blocker, and concrete results that later passes must not regress even if the preferred route changes.',
      properties: {
        best_known_state: {
          type: 'string',
          description:
            'Current strongest surviving frontier or closest-to-success state achieved so far. If a previous leading route was downgraded or partially invalidated, make that explicit here instead of preserving an outdated optimistic summary.',
        },
        live_blocker: {
          type: 'string',
          description:
            'Single most important contract-level issue currently blocking acceptance. When verification feedback exists, this should normally align with the active blocking_gap rather than a generic difficulty statement.',
        },
        must_preserve: {
          type: 'array',
          description:
            'Concrete results, artifacts, or established facts that later passes must preserve even if the current preferred route changes. Include boundary-sensitive facts such as allowed modified-file scope, directly confirmed subset definitions, or verified artifact behavior when they would be costly to rediscover. If nothing stable exists yet, say that explicitly as one item instead of leaving this empty.',
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
