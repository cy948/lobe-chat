import type { GraphRuntimeGuidance } from '@lobechat/types';

import { BaseVirtualLastUserContentProvider } from '../base/BaseVirtualLastUserContentProvider';
import type { PipelineContext, ProcessorOptions } from '../types';

export interface GraphRuntimeGuidanceInjectorConfig {
  enabled?: boolean;
  guidance?: GraphRuntimeGuidance;
}

const escapeXmlAttribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

export class GraphRuntimeGuidanceInjector extends BaseVirtualLastUserContentProvider {
  readonly name = 'GraphRuntimeGuidanceInjector';

  constructor(
    private config: GraphRuntimeGuidanceInjectorConfig,
    options: ProcessorOptions = {},
  ) {
    super(options);
  }

  protected buildContent(_context: PipelineContext): string | null {
    if (!this.config.enabled || !this.config.guidance) return null;

    const { budgetStatus, stage } = this.config.guidance;
    const escapedStage = escapeXmlAttribute(stage);

    if (budgetStatus === 'near_exhaustion') {
      return [
        `<graph_runtime_guidance stage="${escapedStage}" budget_status="near_exhaustion">`,
        'The current Graph stage budget is nearly exhausted. Begin finalization now.',
        'Do not start new exploratory branches. Consolidate the evidence already gathered,',
        'complete the remaining actions required by graph_node_context, and produce the stage',
        'result matching its output_contract.',
        '</graph_runtime_guidance>',
      ].join('\n');
    }

    return [
      `<graph_runtime_guidance stage="${escapedStage}">`,
      'The current Graph stage remains active. Continue following the constraints and output contract in graph_node_context.',
      '</graph_runtime_guidance>',
    ].join('\n');
  }

  protected async doProcess(context: PipelineContext): Promise<PipelineContext> {
    const content = this.buildContent(context);
    if (!content) return this.markAsExecuted(context);

    const clonedContext = this.cloneContext(context);
    clonedContext.messages.push(this.createVirtualLastUserMessage(content));

    return this.markAsExecuted(clonedContext);
  }
}
