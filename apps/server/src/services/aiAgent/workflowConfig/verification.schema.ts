export const verificationSchema = {
  type: 'object',
  description:
    'Verification extraction result. Produce concrete JSON only. source_of_truth is the only acceptance authority; inspection_handoff is fallible and may be corrected.',
  properties: {
    decision: {
      type: 'string',
      enum: ['accept', 'needs_work'],
      description:
        'accept only when every source_of_truth delivery requirement is satisfied. needs_work when any source_of_truth delivery requirement is unsatisfied or unknown.',
    },
    checks: {
      type: 'array',
      description:
        'Non-empty list of delivery-contract checks grounded in source_of_truth. Use inspection_handoff delivery_contract items as candidate checks, but correct or mark them not_required when they conflict with source_of_truth. When the task includes bounded-edit, cleanup, repository-state, or no-unrelated-change boundaries, checks should cover those boundaries explicitly instead of only the main positive deliverable.',
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
              'Specific observed evidence, missing evidence, mismatch, or why source_of_truth does not require this inspection contract. When relevant, say whether unrelated-file-change or artifact-boundary checks were directly performed or remain unresolved.',
          },
        },
        required: ['contract', 'status', 'note'],
        additionalProperties: false,
        examples: [
          {
            contract: 'Web server serves hello.html on port 8080',
            status: 'unsatisfied',
            note: 'source_of_truth requires curl http://server:8080/hello.html to return hello world, but no successful curl or listener evidence was observed.',
          },
          {
            contract: 'Use nginx',
            status: 'not_required',
            note: 'inspection_handoff suggested nginx, but source_of_truth only requires a web server on port 8080.',
          },
        ],
      },
    },
  },
  required: ['decision', 'checks'],
  additionalProperties: false,
  examples: [
    {
      decision: 'needs_work',
      checks: [
        {
          contract: 'Web server serves hello.html on port 8080',
          status: 'unsatisfied',
          note: 'source_of_truth requires curl http://server:8080/hello.html to return hello world, but no successful curl or listener evidence was observed.',
        },
        {
          contract: 'Use nginx',
          status: 'not_required',
          note: 'inspection_handoff suggested nginx, but source_of_truth only requires a web server on port 8080.',
        },
      ],
    },
  ],
};
