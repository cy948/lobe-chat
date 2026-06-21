export const inspectionSchema = {
  type: 'object',
  properties: {
    plan: { type: 'string' },
  },
  required: ['plan'],
  additionalProperties: false,
};
