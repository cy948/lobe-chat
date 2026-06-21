import type { GraphPhaseToolPolicy } from '../types';

export const GRAPH_PHASE_TOOLS_METADATA_KEY = '__graphPhaseTools';
export const GRAPH_PHASE_TOOL_POLICY_METADATA_KEY = '__graphPhaseToolPolicy';

const TOOL_NAME_SEPARATOR = '____';

const getToolApiNameFromModelTool = (tool: any): string | undefined => {
  const name = tool?.function?.name;
  if (typeof name !== 'string') return undefined;

  const parts = name.split(TOOL_NAME_SEPARATOR);
  return parts.length >= 2 ? parts[1] : name;
};

export const filterToolsForGraphPhase = (
  tools: any[] | undefined,
  policy: GraphPhaseToolPolicy | undefined,
): any[] | undefined => {
  if (!tools || !policy?.allowedApiNames) return tools;

  const allowed = new Set(policy.allowedApiNames);
  return tools.filter((tool) => {
    const apiName = getToolApiNameFromModelTool(tool);
    return apiName ? allowed.has(apiName) : false;
  });
};

export interface GraphPhaseToolPolicyMetadata {
  allowedApiNames: string[];
  phase: string;
}

export const getGraphPhaseToolPolicyFromMetadata = (
  metadata: Record<string, any> | undefined,
): GraphPhaseToolPolicyMetadata | undefined => {
  const policy = metadata?.[GRAPH_PHASE_TOOL_POLICY_METADATA_KEY];
  if (!policy || typeof policy !== 'object') return undefined;
  if (typeof policy.phase !== 'string') return undefined;
  if (!Array.isArray(policy.allowedApiNames)) return undefined;

  return {
    allowedApiNames: policy.allowedApiNames.filter(
      (name: unknown): name is string => typeof name === 'string',
    ),
    phase: policy.phase,
  };
};
