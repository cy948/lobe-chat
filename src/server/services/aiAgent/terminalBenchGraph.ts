import type { ReasoningGraph } from '@lobechat/agent-runtime';

const booleanSchema = { type: 'boolean' };
const stringArraySchema = { items: { type: 'string' }, type: 'array' };

export const terminalBenchGraph: ReasoningGraph = {
  name: 'cli-micro-iteration-v1',
  description:
    'CLI task workflow: understand the task, inspect the environment, then make steady goal/action/verification progress before final review.',
  entry: 'inspect_environment',
  terminal: 'final_review',
  maxBacktracks: 4,
  states: {
    inspect_environment: {
      type: 'agent',
      prompt:
        'You are starting a CLI environment task.\n\n' +
        'Original user task:\n{{input.question}}\n\n' +
        'First, understand the user intention and inspect the execution environment before making broad changes. Use available tools to identify:\n' +
        '- what the task is asking for in plain language\n' +
        '- the repository or workspace layout\n' +
        '- relevant files, tests, scripts, services, ports, and dependencies\n' +
        '- useful success signals from the user task or environment\n' +
        '- likely risks or ambiguities\n\n' +
        'Do not implement the solution in this phase unless a tiny read-only or harmless probe is necessary.',
      outputSchema: {
        type: 'object',
        properties: {
          task_goal: { type: 'string' },
          environment_findings: stringArraySchema,
          relevant_paths: stringArraySchema,
          success_signals: stringArraySchema,
          risks: stringArraySchema,
          confidence: { type: 'number' },
        },
        required: [
          'task_goal',
          'environment_findings',
          'relevant_paths',
          'success_signals',
          'risks',
          'confidence',
        ],
        additionalProperties: false,
      },
    },
    make_plan: {
      type: 'llm',
      prompt:
        'Create a concise execution plan for the CLI task.\n\n' +
        'Original task:\n{{input.question}}\n\n' +
        'Task goal:\n{{inspect_environment.task_goal}}\n\n' +
        'Environment findings:\n{{inspect_environment.environment_findings}}\n\n' +
        'Success signals:\n{{inspect_environment.success_signals}}\n\n' +
        'Risks:\n{{inspect_environment.risks}}\n\n' +
        'The plan should be a compact direction, not a rigid script. Prefer a sequence of small goals that can each be implemented and checked.',
      outputSchema: {
        type: 'object',
        properties: {
          strategy: { type: 'string' },
          candidate_goals: stringArraySchema,
          first_goal: { type: 'string' },
          must_not_do: stringArraySchema,
          confidence: { type: 'number' },
        },
        required: ['strategy', 'candidate_goals', 'first_goal', 'must_not_do', 'confidence'],
        additionalProperties: false,
      },
    },
    working_loop: {
      type: 'agent',
      prompt:
        'Continue the CLI task with one focused micro-iteration.\n\n' +
        'Original task:\n{{input.question}}\n\n' +
        'Task goal:\n{{inspect_environment.task_goal}}\n\n' +
        'Success signals:\n{{inspect_environment.success_signals}}\n\n' +
        'Strategy:\n{{make_plan.strategy}}\n\n' +
        'Candidate goals:\n{{make_plan.candidate_goals}}\n\n' +
        'Previous loop summary:\n{{working_loop.summary}}\n\n' +
        'Previous next goal:\n{{working_loop.next_goal}}\n\n' +
        'Rules:\n' +
        '- Pick one useful current goal for this iteration.\n' +
        '- Implement only what is needed for that goal.\n' +
        '- Verify that specific change before moving on.\n' +
        '- Work in the evaluator-visible environment.\n' +
        '- Prefer small, reversible changes.\n' +
        '- If verification reveals a concrete failure, address that before trying unrelated changes.\n' +
        '- When the task appears complete, set status to ready_for_final instead of continuing to polish.',
      outputSchema: {
        type: 'object',
        properties: {
          current_goal: { type: 'string' },
          action_taken: { type: 'string' },
          verification_done: { type: 'string' },
          findings: stringArraySchema,
          status: {
            type: 'string',
            enum: ['continue', 'ready_for_final', 'blocked'],
          },
          next_goal: { type: 'string' },
          summary: { type: 'string' },
        },
        required: [
          'current_goal',
          'action_taken',
          'verification_done',
          'findings',
          'status',
          'next_goal',
          'summary',
        ],
        additionalProperties: false,
      },
    },
    final_review: {
      type: 'llm',
      prompt:
        'Decide whether the agent may finish.\n\n' +
        'Original task:\n{{input.question}}\n\n' +
        'Task goal:\n{{inspect_environment.task_goal}}\n\n' +
        'Success signals:\n{{inspect_environment.success_signals}}\n\n' +
        'Plan strategy:\n{{make_plan.strategy}}\n\n' +
        'Latest iteration summary:\n{{working_loop.summary}}\n\n' +
        'Latest verification:\n{{working_loop.verification_done}}\n\n' +
        'Latest findings:\n{{working_loop.findings}}\n\n' +
        'Decide whether the task should finish or return to the working loop. Be conservative when the latest verification is missing, weak, or contradicts the task goal.',
      outputSchema: {
        type: 'object',
        properties: {
          ready_to_finish: booleanSchema,
          final_summary: { type: 'string' },
          remaining_risks: stringArraySchema,
          next_goal: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: [
          'ready_to_finish',
          'final_summary',
          'remaining_risks',
          'next_goal',
          'confidence',
        ],
        additionalProperties: false,
      },
    },
  },
  transitions: [
    {
      from: 'working_loop',
      to: 'working_loop',
      condition: 'output.status === "continue"',
    },
    {
      from: 'working_loop',
      to: 'final_review',
      condition: 'output.status === "ready_for_final" || output.status === "blocked"',
    },
    {
      from: 'final_review',
      to: 'working_loop',
      condition: 'output.ready_to_finish === false',
    },
  ],
};
