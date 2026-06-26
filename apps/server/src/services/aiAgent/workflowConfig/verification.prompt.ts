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
  'For each delivery_contract candidate, emit one check with contract, status, and note. Use status "satisfied" only when source_of_truth requires the contract and direct observed evidence shows it is met. Use "unsatisfied" when source_of_truth requires it and evidence shows it is not satisfied. Use "unknown" when source_of_truth requires it but verification lacks enough direct evidence. Use "not_required" when inspection_handoff proposed a contract that source_of_truth does not require.\n\n' +
  'Checks must cover the full required contract, not just the easiest success condition. If source_of_truth defines a bounded edit, cleanup-only change, repository-state constraint, or clean deliverable requirement, include checks for unrelated file changes, stray generated artifacts, or other boundary conditions when they are part of the task. If that boundary was not directly checked, do not mark the overall requirement satisfied.\n\n' +
  'In note, distinguish observed evidence from inferred reasoning. If the strongest support is only an inference, a silent zero exit code, file presence alone, partial output, or an unverified candidate route, do not mark the check satisfied. If the task may have violated a no-unrelated-change boundary and verification did not directly rule that out, use unsatisfied or unknown rather than satisfied.\n\n' +
  'Treat exploration_goal, performance_target, and working_only_unknown items as context for what working tried, not as acceptance gates. Return "accept" only when every source_of_truth delivery requirement is satisfied, including required boundary checks; not_required checks may still accept. Return "needs_work" if any source_of_truth delivery requirement is unsatisfied or unknown.';
