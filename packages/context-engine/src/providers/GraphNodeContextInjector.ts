import type { GraphNodeRuntimeContext } from '@lobechat/types';

import { BaseFirstUserContentProvider } from '../base/BaseFirstUserContentProvider';
import type { PipelineContext, ProcessorOptions } from '../types';

export interface GraphNodeContextInjectorConfig {
  context?: GraphNodeRuntimeContext;
  enabled?: boolean;
}

const escapeXmlContent = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const serializeContext = (value: GraphNodeRuntimeContext['inputContext']): string =>
  JSON.stringify(value, null, 2).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');

export class GraphNodeContextInjector extends BaseFirstUserContentProvider {
  readonly name = 'GraphNodeContextInjector';

  constructor(
    private config: GraphNodeContextInjectorConfig,
    options: ProcessorOptions = {},
  ) {
    super(options);
  }

  protected buildContent(_context: PipelineContext): string | null {
    if (!this.config.enabled || !this.config.context) return null;

    const { inputContext, outputContract, taskInstruction } = this.config.context;

    return [
      '<graph_node_context>',
      '<input_context>',
      serializeContext(inputContext),
      '</input_context>',
      `<task_instruction>${escapeXmlContent(taskInstruction)}</task_instruction>`,
      '<output_contract>',
      serializeContext(outputContract),
      '</output_contract>',
      '</graph_node_context>',
    ].join('\n');
  }
}
