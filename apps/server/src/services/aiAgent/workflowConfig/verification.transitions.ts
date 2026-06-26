export const verificationTransitions = [
  {
    from: 'verification',
    to: 'working',
    condition: 'output.decision === "needs_work"',
    clearNodes: ['working'],
    handoff: {
      fields: ['feedback'],
    },
  },
];
