import type { LLMRuntimeContext } from '@lobechat/types';

import { BaseFirstUserContentProvider } from '../base/BaseFirstUserContentProvider';
import type { PipelineContext, ProcessorOptions } from '../types';
import { renderRuntimeAdditionalContexts } from './runtimeAdditionalContextRenderer';

export interface RuntimeAdditionalContextStableProviderConfig {
  runtimeContext?: LLMRuntimeContext;
}

export class RuntimeAdditionalContextStableProvider extends BaseFirstUserContentProvider {
  readonly name = 'RuntimeAdditionalContextStableProvider';

  constructor(
    private config: RuntimeAdditionalContextStableProviderConfig,
    options: ProcessorOptions = {},
  ) {
    super(options);
  }

  protected buildContent(_context: PipelineContext): string | null {
    return renderRuntimeAdditionalContexts(
      this.config.runtimeContext?.additionalContexts,
      'stable_prefix',
    );
  }
}
