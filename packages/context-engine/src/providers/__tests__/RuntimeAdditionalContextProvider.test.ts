import type { RuntimeAdditionalContextFragment } from '@lobechat/types';
import { describe, expect, it } from 'vitest';

import type { PipelineContext } from '../../types';
import { RuntimeAdditionalContextProvider } from '../RuntimeAdditionalContextProvider';

const createContext = (): PipelineContext => ({
  initialState: { messages: [], model: 'test-model', provider: 'test-provider' },
  isAborted: false,
  messages: [{ content: 'Hello', role: 'user' }],
  metadata: { maxTokens: 4000, model: 'test-model' },
});

describe('RuntimeAdditionalContextProvider', () => {
  it('renders ordered sections with format-specific escaping', async () => {
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

    const result = await new RuntimeAdditionalContextProvider({
      additionalContexts: fragments,
    }).process(createContext());

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({ content: 'Hello', role: 'user' });
    expect(result.messages.at(-1)?.content).toBe(
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

  it('preserves fragment order and skips injection without fragments', async () => {
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

    const result = await new RuntimeAdditionalContextProvider({
      additionalContexts: fragments,
    }).process(createContext());
    const emptyResult = await new RuntimeAdditionalContextProvider({
      additionalContexts: [],
    }).process(createContext());
    const undefinedResult = await new RuntimeAdditionalContextProvider({}).process(createContext());

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({ content: 'Hello', role: 'user' });
    expect(result.messages.at(-1)?.content).toBe(
      '<one>\ntail-one\n</one>\n\n<stable>\nstable\n</stable>\n\n<two>\ntail-two\n</two>',
    );
    expect(emptyResult.messages).toEqual(createContext().messages);
    expect(undefinedResult.messages).toEqual(createContext().messages);
  });

  it('reuses an existing synthetic tail user message', async () => {
    const result = await new RuntimeAdditionalContextProvider({
      additionalContexts: [
        {
          content: { text: 'Current stage.', type: 'text' },
          id: 'stage',
          wrapper: { tag: 'stage_context' },
        },
      ],
    }).process({
      ...createContext(),
      messages: [
        { content: 'Hello', role: 'user' },
        {
          content: 'Existing hint',
          meta: { injectType: 'OtherProvider', virtualLastUser: true },
          role: 'user',
        },
      ],
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages.at(-1)?.content).toBe(
      'Existing hint\n\n<stage_context>\nCurrent stage.\n</stage_context>',
    );
  });
});
