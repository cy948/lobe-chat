import type {
  AgentGraphRuntimeConfig,
  AgentReasoningGraphSnapshot,
  LobeAgentConfig,
} from '@lobechat/types';
import type { ReasoningGraph } from '@lobechat/agent-runtime';

interface GraphValidationResult {
  error?: string;
  graph?: ReasoningGraph;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const validateGraphSnapshot = (
  snapshot: AgentReasoningGraphSnapshot | undefined,
): GraphValidationResult => {
  if (!snapshot) return { error: 'graphRuntime.snapshot is required when graphRuntime.enabled=true' };

  const { entry, maxBacktracks, name, states, terminal, transitions } = snapshot;

  if (!name || typeof name !== 'string') return { error: 'graphRuntime.snapshot.name must be a string' };
  if (!entry || typeof entry !== 'string') return { error: 'graphRuntime.snapshot.entry must be a string' };
  if (!terminal || typeof terminal !== 'string') {
    return { error: 'graphRuntime.snapshot.terminal must be a string' };
  }
  if (typeof maxBacktracks !== 'number' || Number.isNaN(maxBacktracks)) {
    return { error: 'graphRuntime.snapshot.maxBacktracks must be a number' };
  }
  if (!isRecord(states) || Object.keys(states).length === 0) {
    return { error: 'graphRuntime.snapshot.states must be a non-empty record' };
  }
  if (!Array.isArray(transitions)) {
    return { error: 'graphRuntime.snapshot.transitions must be an array' };
  }

  for (const [stateId, state] of Object.entries(states)) {
    if (!isRecord(state)) return { error: `graphRuntime.snapshot.states.${stateId} must be an object` };
    if (state.type !== 'agent' && state.type !== 'llm') {
      return { error: `graphRuntime.snapshot.states.${stateId}.type must be "agent" or "llm"` };
    }
    if (typeof state.prompt !== 'string') {
      return { error: `graphRuntime.snapshot.states.${stateId}.prompt must be a string` };
    }
    if (!isRecord(state.outputSchema)) {
      return { error: `graphRuntime.snapshot.states.${stateId}.outputSchema must be an object` };
    }
    if (
      state.allowedToolApiNames !== undefined &&
      !isStringArray(state.allowedToolApiNames)
    ) {
      return {
        error: `graphRuntime.snapshot.states.${stateId}.allowedToolApiNames must be a string array`,
      };
    }
    if (
      state.maxAgentSteps !== undefined &&
      (typeof state.maxAgentSteps !== 'number' || Number.isNaN(state.maxAgentSteps))
    ) {
      return {
        error: `graphRuntime.snapshot.states.${stateId}.maxAgentSteps must be a number`,
      };
    }
  }

  if (!states[entry]) return { error: `graphRuntime.snapshot.entry "${entry}" is not defined in states` };
  if (!states[terminal]) {
    return { error: `graphRuntime.snapshot.terminal "${terminal}" is not defined in states` };
  }

  for (const [index, transition] of transitions.entries()) {
    if (!isRecord(transition)) {
      return { error: `graphRuntime.snapshot.transitions[${index}] must be an object` };
    }
    if (typeof transition.from !== 'string' || !states[transition.from]) {
      return {
        error: `graphRuntime.snapshot.transitions[${index}].from must reference an existing state`,
      };
    }
    if (typeof transition.to !== 'string' || !states[transition.to]) {
      return {
        error: `graphRuntime.snapshot.transitions[${index}].to must reference an existing state`,
      };
    }
    if (typeof transition.condition !== 'string') {
      return {
        error: `graphRuntime.snapshot.transitions[${index}].condition must be a string`,
      };
    }
    if (transition.clearNodes !== undefined && !isStringArray(transition.clearNodes)) {
      return {
        error: `graphRuntime.snapshot.transitions[${index}].clearNodes must be a string array`,
      };
    }
    if (transition.handoff !== undefined) {
      if (!isRecord(transition.handoff)) {
        return {
          error: `graphRuntime.snapshot.transitions[${index}].handoff must be an object`,
        };
      }
      if (
        transition.handoff.fields !== undefined &&
        !isStringArray(transition.handoff.fields)
      ) {
        return {
          error: `graphRuntime.snapshot.transitions[${index}].handoff.fields must be a string array`,
        };
      }
    }
  }

  return { graph: snapshot as ReasoningGraph };
};

export const resolveGraphRuntimeConfig = (
  agentConfig: LobeAgentConfig | undefined,
): GraphValidationResult & { graphRuntime?: AgentGraphRuntimeConfig } => {
  const graphRuntime = agentConfig?.chatConfig?.graphRuntime;
  if (!graphRuntime?.enabled) return { graphRuntime };

  const result = validateGraphSnapshot(graphRuntime.snapshot);
  return { ...result, graphRuntime };
};
