import { escapeXmlAttr, escapeXmlContent } from '@lobechat/prompts';
import type { RuntimeAdditionalContextFragment } from '@lobechat/types';

import { BaseVirtualLastUserContentProvider } from '../base/BaseVirtualLastUserContentProvider';
import type { PipelineContext, ProcessorOptions } from '../types';

export interface RuntimeAdditionalContextProviderConfig {
  additionalContexts?: readonly RuntimeAdditionalContextFragment[];
}

export class RuntimeAdditionalContextProvider extends BaseVirtualLastUserContentProvider {
  readonly name = 'RuntimeAdditionalContextProvider';
  protected override readonly appendToRealLastUser = false;

  constructor(
    private config: RuntimeAdditionalContextProviderConfig,
    options: ProcessorOptions = {},
  ) {
    super(options);
  }

  protected buildContent(_context: PipelineContext): string | null {
    if (!this.config.additionalContexts?.length) return null;

    return this.config.additionalContexts
      .map((fragment) => {
        const attributes = Object.entries(fragment.wrapper.attributes ?? {})
          .map(([key, value]) => ` ${key}="${escapeXmlAttr(value)}"`)
          .join('');
        const content =
          fragment.content.type === 'text'
            ? escapeXmlContent(fragment.content.text)
            : fragment.content.sections
                .map((section) => {
                  const value =
                    section.format === 'text'
                      ? escapeXmlContent(String(section.value))
                      : JSON.stringify(
                          section.value,
                          null,
                          section.format === 'compact_json' ? undefined : 2,
                        )
                          .replaceAll('<', '\\u003c')
                          .replaceAll('>', '\\u003e');

                  return [`<${section.tag}>`, value, `</${section.tag}>`].join(
                    section.format === 'text' ? '' : '\n',
                  );
                })
                .join('\n');

        return [
          `<${fragment.wrapper.tag}${attributes}>`,
          content,
          `</${fragment.wrapper.tag}>`,
        ].join('\n');
      })
      .join('\n\n');
  }
}
