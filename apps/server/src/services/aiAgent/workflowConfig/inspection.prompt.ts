export const inspectionPrompt =
  'Inspect the task and environment before making changes.\n\n' +
  'Original task:\n{{input.question}}\n\n' +
  'Use available read-only tools to understand what needs to be delivered, what files or commands matter, and what constraints are visible.\n\n' +
  'Do not edit files, run mutation commands, or implement the solution in this phase. Produce only the plan for the next phase.';
