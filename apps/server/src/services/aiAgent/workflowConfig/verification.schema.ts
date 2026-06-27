export const verificationSchema = {
  type: 'object',
  description:
    'Verification extraction result. Produce concrete JSON only. source_of_truth is the only acceptance authority; inspection_handoff is fallible and may be corrected.',
  properties: {
    decision: {
      type: 'string',
      enum: ['accept', 'needs_work'],
      description:
        'accept only as a last resort after checking for active contract violations, unresolved ambiguity, and missing direct evidence. If any required boundary check is still unchecked or any required criterion is unsatisfied or unknown, decision must be needs_work.',
    },
    checks: {
      type: 'array',
      description:
        'Non-empty list of delivery-contract checks grounded in source_of_truth. Use inspection_handoff delivery_contract items as candidate checks, but correct or mark them not_required when they conflict with source_of_truth. When the task includes bounded-edit, cleanup, repository-state, or no-unrelated-change boundaries, checks should cover those boundaries explicitly instead of only the main positive deliverable, including direct comparison of the modified-file or artifact set against the allowed scope when relevant. For dataset, taxonomy, field-mapping, or counting-definition tasks, checks should cover the exact chosen interpretation when ambiguity could change the answer. Do not mark a contract satisfied when unresolved ambiguity, narrowed interpretation, widened cleanup scope, or partial boundary coverage still leaves multiple plausible task-consistent outcomes.',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          contract: {
            type: 'string',
            description:
              'Exact source_of_truth requirement being checked, or the inspection delivery_contract being corrected.',
          },
          status: {
            type: 'string',
            enum: ['satisfied', 'unsatisfied', 'unknown', 'not_required'],
            description:
              'satisfied: required by source_of_truth and evidence shows it is met. unsatisfied: required and evidence shows mismatch. unknown: required but evidence is missing. not_required: proposed by inspection_handoff but not required by source_of_truth.',
          },
          note: {
            type: 'string',
            description:
              'Specific latest observed evidence, latest missing evidence, unresolved ambiguity, current mismatch, or why source_of_truth does not require this inspection contract. Distinguish current active gaps from earlier failures that were later repaired or superseded. When relevant, say whether unrelated-file-change or artifact-boundary checks were directly performed or remain unresolved, whether modified files or artifacts were directly compared against allowed scope, whether the chosen dataset subset / field mapping / token definition was directly confirmed, and whether broader cleanup outside the original scope was observed but not task-required.',
          },
        },
        required: ['contract', 'status', 'note'],
        additionalProperties: false,
        examples: [
          {
            contract: 'Web server serves hello.html on port 8080',
            status: 'unsatisfied',
            note: 'Latest verification evidence still lacks a successful curl or listener observation for the required endpoint, so this remains an active gap.',
          },
          {
            contract: 'Use nginx',
            status: 'not_required',
            note: 'inspection_handoff suggested nginx, but source_of_truth only requires a web server on port 8080.',
          },
        ],
      },
    },
    feedback: {
      type: 'object',
      description:
        'Structured backtrack feedback for working. Required when decision is needs_work. Omit when decision is accept. This is a latest-pass closure-failure handoff, not a next-step action plan.',
      properties: {
        preserve: {
          type: 'array',
          description:
            'Concrete results, artifacts, or established facts from the last working pass that still hold after the latest verification pass and should be preserved. Include only items that verification still trusts.',
          items: {
            type: 'string',
          },
          minItems: 1,
        },
        blocking_gap: {
          type: 'string',
          description:
            'Single most important current contract-level gap blocking accept. Name the active failure or unresolved ambiguity, not a vague request for more work.',
        },
        evidence_needed: {
          type: 'string',
          description:
            'Direct evidence or decisive check still needed to close the current blocking gap. If the current route itself looks invalid, say what must be disproved or corrected.',
        },
      },
      required: ['preserve', 'blocking_gap', 'evidence_needed'],
      additionalProperties: false,
      examples: [
        {
          preserve: ['Service starts and listens on port 8080'],
          blocking_gap:
            'Verification still lacks direct evidence that /hello.html returns hello world.',
          evidence_needed:
            'Run a successful curl against the required endpoint and observe the expected response.',
        },
      ],
    },
  },
  required: ['decision', 'checks'],
  oneOf: [
    {
      properties: {
        decision: { const: 'accept' },
      },
    },
    {
      properties: {
        decision: { const: 'needs_work' },
      },
      required: ['feedback'],
    },
  ],
  additionalProperties: false,
  examples: [
    {
      decision: 'needs_work',
      checks: [
        {
          contract: 'Web server serves hello.html on port 8080',
          status: 'unsatisfied',
          note: 'Latest verification evidence still lacks a successful curl or listener observation for the required endpoint, so this remains an active gap.',
        },
        {
          contract: 'Use nginx',
          status: 'not_required',
          note: 'inspection_handoff suggested nginx, but source_of_truth only requires a web server on port 8080.',
        },
      ],
      feedback: {
        preserve: ['Port 8080 listener is configured'],
        blocking_gap:
          'Verification still lacks direct evidence that hello.html is served with the required content.',
        evidence_needed:
          'Observe a successful curl to the required URL returning the expected body.',
      },
    },
  ],
};
