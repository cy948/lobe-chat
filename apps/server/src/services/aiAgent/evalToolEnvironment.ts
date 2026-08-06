import type {
  LobeToolManifest,
  OperationToolSet,
  ToolExecutor,
  ToolSource,
} from '@lobechat/context-engine';
import { generateToolsFromManifest } from '@lobechat/context-engine';
import type { EvalCaseEnvironment } from '@lobechat/types';

interface EvalToolSet {
  enabledToolIds: string[];
  executorMap: Record<string, ToolExecutor>;
  manifestMap: Record<string, LobeToolManifest>;
  sourceMap: Record<string, ToolSource>;
  tools: OperationToolSet['tools'];
}

type EvalConnectorManifest = LobeToolManifest & {
  mcpParams?: { type?: string };
};

export const injectEvalToolEnvironment = (
  toolSet: EvalToolSet,
  environment?: EvalCaseEnvironment,
): EvalToolSet => {
  if (!environment) return toolSet;

  let tools = [...toolSet.tools];

  for (const provider of environment.toolProviders) {
    const { connectorIdentifier } = provider;
    const manifest = toolSet.manifestMap[connectorIdentifier] as EvalConnectorManifest | undefined;
    if (!manifest) {
      throw new Error(`Eval connector is unavailable: ${connectorIdentifier}`);
    }
    if (manifest.mcpParams?.type !== 'http') {
      throw new Error(`Eval connector must use HTTP MCP: ${connectorIdentifier}`);
    }

    // Hide the physical connector from the model and expose the same API
    // under the logical provider ID. The physical MCP params remain bound
    // in the cloned manifest for execution.
    if (provider.identifier === connectorIdentifier) {
      if (!toolSet.enabledToolIds.includes(provider.identifier)) {
        toolSet.enabledToolIds.push(provider.identifier);
      }
      continue;
    }

    const physicalToolNames = new Set(
      generateToolsFromManifest(manifest).map((tool) => tool.function.name),
    );
    tools = tools.filter((tool) => !physicalToolNames.has(tool.function.name));

    const logicalManifest: EvalConnectorManifest = {
      ...manifest,
      identifier: provider.identifier,
      ...(provider.name ? { meta: { ...manifest.meta, title: provider.name } } : {}),
    };
    toolSet.manifestMap[provider.identifier] = logicalManifest;
    toolSet.sourceMap[provider.identifier] = toolSet.sourceMap[connectorIdentifier] ?? 'mcp';
    toolSet.executorMap[provider.identifier] = toolSet.executorMap[connectorIdentifier] ?? 'server';
    tools.push(...generateToolsFromManifest(logicalManifest));
    toolSet.enabledToolIds = toolSet.enabledToolIds.filter((id) => id !== connectorIdentifier);
    if (!toolSet.enabledToolIds.includes(provider.identifier)) {
      toolSet.enabledToolIds.push(provider.identifier);
    }
  }

  return { ...toolSet, tools };
};
