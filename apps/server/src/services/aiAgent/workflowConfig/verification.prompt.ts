export const verificationPrompt =
  'Verify the result from the working phase and decide whether to accept it or send it back.\n\n' +
  '<source_of_truth>\n{{input.question}}\n</source_of_truth>\n\n' +
  '<inspection_handoff>\n' +
  'Intent:\n{{inspection.intent}}\n\n' +
  'Subgoals:\n{{inspection.subgoals}}\n\n' +
  '</inspection_handoff>\n\n' +
  '<working_result>\n{{working.summary}}\n</working_result>\n\n' +
  'Use inspection and validation tools as needed. Do not do the main implementation work here.\n\n' +
  'source_of_truth is the only acceptance authority. inspection_handoff is fallible and must be checked against source_of_truth before use. Use delivery_contract subgoals as candidate checks, but do not let a contract block acceptance if it conflicts with source_of_truth or adds an extra requirement.\n\n' +
  'For each delivery_contract candidate, emit one check with contract, status, and note. Use status "satisfied" when source_of_truth requires the contract and the final observed state satisfies it. Use "unsatisfied" when source_of_truth requires it and evidence shows it is not satisfied. Use "unknown" when source_of_truth requires it but verification lacks enough evidence. Use "not_required" when inspection_handoff proposed a contract that source_of_truth does not require.\n\n' +
  'Treat exploration_goal, performance_target, and working_only_unknown items as context for what working tried, not as acceptance gates. Return "accept" only when every source_of_truth delivery requirement is satisfied; not_required checks may still accept. Return "needs_work" if any source_of_truth delivery requirement is unsatisfied or unknown.';
