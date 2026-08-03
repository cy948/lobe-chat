import type { RuntimeAdditionalContextFragment } from '@lobechat/types';
import { describe, expect, it } from 'vitest';

import { renderRuntimeAdditionalContexts } from '../RuntimeAdditionalContextProvider';

describe('RuntimeAdditionalContextProvider renderer', () => {
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
        wrapper: {
          attributes: { label: 'a"<&>' },
          tag: 'context',
        },
      },
      {
        content: { text: 'Second & final.', type: 'text' },
        id: 'second',
        wrapper: { tag: 'note' },
      },
    ];

    expect(renderRuntimeAdditionalContexts(fragments)).toBe(
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

  it('preserves fragment order and returns null without fragments', () => {
    const fragments: RuntimeAdditionalContextFragment[] = [
      {
        content: { text: 'tail-one', type: 'text' },
        id: 'tail-one',
        wrapper: { tag: 'one' },
      },
      {
        content: { text: 'stable', type: 'text' },
        id: 'stable',
        wrapper: { tag: 'stable' },
      },
      {
        content: { text: 'tail-two', type: 'text' },
        id: 'tail-two',
        wrapper: { tag: 'two' },
      },
    ];

    expect(renderRuntimeAdditionalContexts(fragments)).toBe(
      '<one>\ntail-one\n</one>\n\n<stable>\nstable\n</stable>\n\n<two>\ntail-two\n</two>',
    );
    expect(renderRuntimeAdditionalContexts([])).toBeNull();
    expect(renderRuntimeAdditionalContexts(undefined)).toBeNull();
  });
});
