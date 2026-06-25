export const workingPrompt =
  'Work on the task using the intent and subgoals from inspection.\n\n' +
  'Original task:\n{{input.question}}\n\n' +
  'Intent:\n{{inspection.intent}}\n\n' +
  'Subgoals:\n{{inspection.subgoals}}\n\n' +
  'Verification feedback from the last backtrack:\n{{handoff.output}}\n\n' +
  'If verification feedback is present, treat unsatisfied and unknown checks as the priority for this working pass. Repair the unmet delivery contract or collect the missing evidence before starting broad new exploration. Do not treat not_required checks as work items.\n\n' +
  'Use the delivery_contract subgoals as the final acceptance checklist. Preserve exact paths, ports, APIs, files, formats, service behavior, and observable outputs from those contracts while choosing implementation details.\n\n' +
  'Interact with the environment, make the needed changes, and produce a concise summary of what was done, which delivery contracts are satisfied, and what state the task is in.';
