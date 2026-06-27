export const workingPrompt =
  'Work on the task using the intent and subgoals from inspection.\n\n' +
  'Original task:\n{{input.question}}\n\n' +
  'Intent:\n{{inspection.intent}}\n\n' +
  'Interpret the inspection fields as follows: each subgoal description is the contract, boundary, or unresolved objective to preserve; handoff.confirmed contains established facts only; handoff.candidates contains tentative routes that may help but are not required; handoff.risks contains unresolved concerns or missing evidence. Do not treat candidate routes as requirements unless the original task explicitly requires that exact route.\n\n' +
  'Treat the original task plus the inspection contract as binding scope, not as optional planning notes. Do not silently narrow a dataset, taxonomy, file set, output surface, or behavioral requirement just because a smaller interpretation looks easier to finish.\n\n' +
  'Contract boundaries are binding. If a subgoal description says to keep unrelated files, artifacts, file regions, branches, or other repository state untouched, preserve that boundary even if a broader cleanup or rewrite looks convenient.\n\n' +
  'Subgoals:\n{{inspection.subgoals}}\n\n' +
  'Working closure state from the last pass, if any:\n{{working.closure_state}}\n\n' +
  'Verification feedback from the last backtrack:\n{{handoff.output}}\n\n' +
  'Keep a closure-oriented state while you work. closure_state.best_known_state should capture the strongest surviving frontier or closest-to-success state achieved so far, not a generic recap. closure_state.live_blocker should name the single most important issue currently preventing accept. closure_state.must_preserve should list concrete results, artifacts, or established facts that must not be lost on the next pass even if the preferred route changes.\n\n' +
  'Interpret verification feedback as follows: feedback.preserve lists results that still hold and must be kept. feedback.blocking_gap names the main gap currently blocking accept. feedback.evidence_needed names the direct evidence or decisive check still required to close that gap. Treat this feedback as closure guidance, not as an action script.\n\n' +
  'If verification feedback is present, preserve what is confirmed, target the blocking gap first, and gather the missing evidence before starting broad new exploration. Explicitly identify which prior route, interpretation, or assumption is no longer trustworthy before committing to the next pass.\n\n' +
  'If a contract boundary or requirement is uncertain, prefer gathering direct evidence over inventing a narrower interpretation. Unknown does not grant permission to change the task into an easier version.\n\n' +
  'Use the delivery_contract subgoals as the final acceptance checklist. Preserve exact paths, ports, APIs, files, formats, service behavior, and observable outputs from those contracts while choosing implementation details.\n\n' +
  'Interact with the environment, make the needed changes, and then produce: (1) a concise summary of what was done and the current task state, and (2) closure_state with best_known_state, live_blocker, and must_preserve.';
