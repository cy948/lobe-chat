export const inspectionSchema = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      description:
        'Short stable task goal. Do not include commands, validation steps, or implementation details.',
    },
    subgoals: {
      type: 'array',
      description:
        'Structured handoff items anchored to authoritative task facts and confirmed read-only evidence. Do not broaden the task scope.',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Short stable label for the subgoal.',
          },
          type: {
            type: 'string',
            description:
              'Subgoal category. delivery_contract is immutable verifier-facing contract; exploration_goal is flexible strategy; performance_target is measurable outcome; working_only_unknown needs execution, mutation, validation, runtime observation, setup, service startup, or tuning.',
            enum: [
              'delivery_contract',
              'exploration_goal',
              'performance_target',
              'working_only_unknown',
            ],
          },
          description: {
            type: 'string',
            description:
              'State the goal or constraint using task-required facts and confirmed read-only evidence only. Preserve hard paths, ports, APIs, output formats, behavior protocols, service lifetime, known scope, and edit/artifact boundary constraints exactly when they are part of the task contract. For bounded edit, cleanup, or repository-state tasks, include both the positive requirement and the negative boundary, such as leaving unrelated files, branches, file regions, or generated artifacts untouched, whenever source_of_truth requires that boundary. Do not include candidate-route content here: no chosen recipe, guessed algorithm, exploit path, parser strategy, compiler trick, framework choice, or runtime workaround unless source_of_truth explicitly requires that exact route.',
          },
          relevant_files: {
            type: 'array',
            description:
              'Known relevant paths from the task or read-only evidence; use an empty list if none are known.',
            items: { type: 'string' },
          },
          handoff: {
            type: 'object',
            description:
              'Structured working handoff. Keep confirmed facts, tentative candidate routes, and unresolved risks separate so working can interpret them correctly.',
            properties: {
              confirmed: {
                type: 'array',
                description:
                  'Established facts from the task text or confirmed read-only evidence only. Include confirmed scope and edit-boundary facts here when they are part of source_of_truth. Do not include guesses or proposed routes.',
                items: { type: 'string' },
              },
              candidates: {
                type: 'array',
                description:
                  'Tentative routes, recipes, or approaches that working may try. These are not requirements unless source_of_truth explicitly requires that exact route. Do not use this field to silently widen a bounded edit into a broader cleanup or repo-wide rewrite.',
                items: { type: 'string' },
              },
              risks: {
                type: 'array',
                description:
                  'Unresolved blockers, missing evidence, uncertainty, or scope risks that working should account for. Include any risk that a broader change could violate a bounded-edit or no-unrelated-change requirement.',
                items: { type: 'string' },
              },
            },
            required: ['confirmed', 'candidates', 'risks'],
            additionalProperties: false,
          },
        },
        required: ['name', 'type', 'description', 'relevant_files', 'handoff'],
        additionalProperties: false,
      },
    },
  },
  required: ['intent', 'subgoals'],
  additionalProperties: false,
};
