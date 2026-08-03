import { escapeXmlAttr, escapeXmlContent } from '@lobechat/prompts';
import type {
  RuntimeAdditionalContextFragment,
  RuntimeAdditionalContextSection,
} from '@lobechat/types';

import { BaseVirtualLastUserContentProvider } from '../base/BaseVirtualLastUserContentProvider';
import type { PipelineContext, ProcessorOptions } from '../types';

export interface RuntimeAdditionalContextProviderConfig {
  additionalContexts?: readonly RuntimeAdditionalContextFragment[];
}

const serializeJson = (value: RuntimeAdditionalContextSection['value'], compact: boolean): string =>
  JSON.stringify(value, null, compact ? undefined : 2)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e');

const renderSection = (section: RuntimeAdditionalContextSection): string => {
  const content =
    section.format === 'text'
      ? escapeXmlContent(String(section.value))
      : serializeJson(section.value, section.format === 'compact_json');

  return [`<${section.tag}>`, content, `</${section.tag}>`].join(
    section.format === 'text' ? '' : '\n',
  );
};

const renderFragment = (fragment: RuntimeAdditionalContextFragment): string => {
  const attributes = Object.entries(fragment.wrapper.attributes ?? {})
    .map(([key, value]) => ` ${key}="${escapeXmlAttr(value)}"`)
    .join('');
  const content =
    fragment.content.type === 'text'
      ? escapeXmlContent(fragment.content.text)
      : fragment.content.sections.map(renderSection).join('\n');

  return [`<${fragment.wrapper.tag}${attributes}>`, content, `</${fragment.wrapper.tag}>`].join(
    '\n',
  );
};

export const renderRuntimeAdditionalContexts = (
  fragments: readonly RuntimeAdditionalContextFragment[] | undefined,
): string | null => {
  if (!fragments?.length) return null;

  return fragments.map(renderFragment).join('\n\n');
};

export class RuntimeAdditionalContextProvider extends BaseVirtualLastUserContentProvider {
  readonly name = 'RuntimeAdditionalContextProvider';

  constructor(
    private config: RuntimeAdditionalContextProviderConfig,
    options: ProcessorOptions = {},
  ) {
    super(options);
  }

  protected buildContent(_context: PipelineContext): string | null {
    return renderRuntimeAdditionalContexts(this.config.additionalContexts);
  }
}
