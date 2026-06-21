export const verificationSchema = {
  type: 'object',
  properties: {
    decision: {
      type: 'string',
      enum: ['accept', 'needs_work'],
    },
    reason: { type: 'string' },
  },
  required: ['decision', 'reason'],
  additionalProperties: false,
};
