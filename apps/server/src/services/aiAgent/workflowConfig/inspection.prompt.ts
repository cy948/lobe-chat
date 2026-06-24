export const inspectionPrompt =
  'Inspect the task and environment before making changes.\n\n' +
  'Original task:\n{{input.question}}\n\n' +
  'Use available read-only tools to understand what needs to be delivered, what files or commands matter, and what constraints are visible.\n\n' +
  'Do not edit files, run mutation commands, or implement the solution in this phase.\n\n' +
  'Return intent as a short stable statement of the task goal. Do not include commands, validation steps, or implementation detail in intent.\n\n' +
  'Return subgoals as a short list of structured items. Each item must include name, type, description, relevant_files, and handoff_note.\n\n' +
  'Use type delivery_contract for hard requirements such as paths, ports, APIs, output formats, service names, or verifier-facing files.\n' +
  'Use type direct_action for work the next phase can execute, such as edits, commands, installs, service startup, or validation runs.\n' +
  'Use type exploration_goal for flexible implementation goals where the approach can change.\n' +
  'Use type performance_target for measurable outcomes that require iteration or observation.\n' +
  'Use type working_only_unknown for questions that need execution, mutation, validation, or runtime observation.\n\n' +
  'In name, use a short stable label such as api-contract, implement-parser, or validation-run.\n' +
  'In description, state the goal or constraint. In relevant_files, list known paths or use an empty list. In handoff_note, say what the next phase should preserve, do, test, or investigate.';
