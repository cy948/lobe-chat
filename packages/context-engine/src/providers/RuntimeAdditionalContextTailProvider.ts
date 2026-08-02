import type { LLMRuntimeContext } from '@lobechat/types';

import { BaseVirtualLastUserContentProvider } from '../base/BaseVirtualLastUserContentProvider';
import type { PipelineContext, ProcessorOptions } from '../types';
import { renderRuntimeAdditionalContexts } from './runtimeAdditionalContextRenderer';

export interface RuntimeAdditionalContextTailProviderConfig {
  runtimeContext?: LLMRuntimeContext;
}

export class RuntimeAdditionalContextTailProvider extends BaseVirtualLastUserContentProvider {
  readonly name = 'RuntimeAdditionalContextTailProvider';

  constructor(
    private config: RuntimeAdditionalContextTailProviderConfig,
    options: ProcessorOptions = {},
  ) {
    super(options);
  }

  protected buildContent(_context: PipelineContext): string | null {
    return renderRuntimeAdditionalContexts(
      this.config.runtimeContext?.additionalContexts,
      'virtual_tail',
    );
  }
}
