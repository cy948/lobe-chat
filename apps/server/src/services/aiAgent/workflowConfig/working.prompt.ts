export const workingPrompt =
  'Work on the task using the intent and subgoals from inspection.\n\n' +
  'Original task:\n{{input.question}}\n\n' +
  'Intent:\n{{inspection.intent}}\n\n' +
  'Subgoals:\n{{inspection.subgoals}}\n\n' +
  'Previous verification reason:\n{{verification.reason}}\n\n' +
  'Interact with the environment, make the needed changes, and produce a concise summary of what was done and what state the task is in.';
