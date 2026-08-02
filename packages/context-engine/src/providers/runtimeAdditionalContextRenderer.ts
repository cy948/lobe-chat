import type {
  RuntimeAdditionalContextFragment,
  RuntimeAdditionalContextSection,
} from '@lobechat/types';

const escapeXmlAttribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const escapeXmlContent = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

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
    .map(([key, value]) => ` ${key}="${escapeXmlAttribute(value)}"`)
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
  placement: RuntimeAdditionalContextFragment['placement'],
): string | null => {
  const matchingFragments = fragments?.filter((fragment) => fragment.placement === placement);
  if (!matchingFragments?.length) return null;

  return matchingFragments.map(renderFragment).join('\n\n');
};
