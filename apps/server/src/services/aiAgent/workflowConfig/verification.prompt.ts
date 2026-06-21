export const verificationPrompt =
  'Verify the result from the working phase and decide whether to accept it or send it back.\n\n' +
  'Original task:\n{{input.question}}\n\n' +
  'Plan:\n{{inspection.plan}}\n\n' +
  'Working summary:\n{{working.summary}}\n\n' +
  'Use inspection and validation tools as needed. Do not do the main implementation work here.\n\n' +
  'Return "accept" only when the task appears complete. Return "needs_work" when more work is required, and explain why.';
