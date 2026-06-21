export const workingSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
  },
  required: ['summary'],
  additionalProperties: false,
};
