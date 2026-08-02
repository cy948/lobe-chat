import type { RuntimeAdditionalContextFragment } from '@lobechat/types';
import { describe, expect, it } from 'vitest';

import { renderRuntimeAdditionalContexts } from '../runtimeAdditionalContextRenderer';

describe('renderRuntimeAdditionalContexts', () => {
  it('renders ordered sections with format-specific escaping', () => {
    const fragments: RuntimeAdditionalContextFragment[] = [
      {
        content: {
          sections: [
            { format: 'json', tag: 'data', value: { markup: '<value>' } },
            { format: 'compact_json', tag: 'tools', value: ['read', 'write'] },
            { format: 'text', tag: 'instruction', value: 'Use <data> & finish.' },
          ],
          type: 'sections',
        },
        id: 'first',
        placement: 'stable_prefix',
        wrapper: {
          attributes: { label: 'a"<&>' },
          tag: 'context',
        },
      },
      {
        content: { text: 'Second & final.', type: 'text' },
        id: 'second',
        placement: 'stable_prefix',
        wrapper: { tag: 'note' },
      },
    ];

    expect(renderRuntimeAdditionalContexts(fragments, 'stable_prefix')).toBe(
      [
        '<context label="a&quot;&lt;&amp;&gt;">',
        '<data>',
        '{',
        '  "markup": "\\u003cvalue\\u003e"',
        '}',
        '</data>',
        '<tools>',
        '["read","write"]',
        '</tools>',
        '<instruction>Use &lt;data&gt; &amp; finish.</instruction>',
        '</context>',
        '',
        '<note>',
        'Second &amp; final.',
        '</note>',
      ].join('\n'),
    );
  });

  it('filters by placement and preserves fragment order', () => {
    const fragments: RuntimeAdditionalContextFragment[] = [
      {
        content: { text: 'tail-one', type: 'text' },
        id: 'tail-one',
        placement: 'virtual_tail',
        wrapper: { tag: 'one' },
      },
      {
        content: { text: 'stable', type: 'text' },
        id: 'stable',
        placement: 'stable_prefix',
        wrapper: { tag: 'stable' },
      },
      {
        content: { text: 'tail-two', type: 'text' },
        id: 'tail-two',
        placement: 'virtual_tail',
        wrapper: { tag: 'two' },
      },
    ];

    expect(renderRuntimeAdditionalContexts(fragments, 'virtual_tail')).toBe(
      '<one>\ntail-one\n</one>\n\n<two>\ntail-two\n</two>',
    );
    expect(renderRuntimeAdditionalContexts(undefined, 'stable_prefix')).toBeNull();
  });
});
