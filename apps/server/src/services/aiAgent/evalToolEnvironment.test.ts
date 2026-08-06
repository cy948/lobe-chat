import { generateToolsFromManifest } from '@lobechat/context-engine';
import { describe, expect, it } from 'vitest';

import { injectEvalToolEnvironment } from './evalToolEnvironment';

describe('injectEvalToolEnvironment', () => {
  it('reuses an HTTP connector manifest for an external eval provider', () => {
    const connectorManifest = {
      api: [{ description: 'Add a value', name: 'add', parameters: {} }],
      identifier: 'state-mock',
      mcpParams: { name: 'state-mock', type: 'http', url: 'https://mock.example.com/mcp' },
      meta: { title: 'State Mock' },
      type: 'mcp' as const,
    };

    const result = injectEvalToolEnvironment(
      {
        enabledToolIds: [],
        executorMap: {},
        manifestMap: { 'state-mock': connectorManifest },
        sourceMap: { 'state-mock': 'mcp' },
        tools: generateToolsFromManifest(connectorManifest),
      },
      {
        toolProviders: [{ connectorIdentifier: 'state-mock', identifier: 'state-mock' }],
      },
    );

    expect(result.manifestMap['state-mock']).toBe(connectorManifest);
    expect(result.tools).toEqual(generateToolsFromManifest(connectorManifest));
    expect(result.enabledToolIds).toEqual(['state-mock']);
  });

  it('fails when an external eval connector is unavailable', () => {
    expect(() =>
      injectEvalToolEnvironment(
        { enabledToolIds: [], executorMap: {}, manifestMap: {}, sourceMap: {}, tools: [] },
        {
          toolProviders: [{ connectorIdentifier: 'missing-mock', identifier: 'missing-mock' }],
        },
      ),
    ).toThrow('Eval connector is unavailable: missing-mock');
  });

  it('rewrites an external connector manifest to the logical provider ID', () => {
    const connectorManifest = {
      api: [{ description: 'Add a value', name: 'add', parameters: {} }],
      identifier: 'state-mock',
      mcpParams: { name: 'state-mock', type: 'http', url: 'https://mock.example.com/mcp' },
      meta: { title: 'State Mock' },
      type: 'mcp' as const,
    };

    const result = injectEvalToolEnvironment(
      {
        enabledToolIds: ['state-mock'],
        executorMap: { 'state-mock': 'server' },
        manifestMap: { 'state-mock': connectorManifest },
        sourceMap: { 'state-mock': 'mcp' },
        tools: generateToolsFromManifest(connectorManifest),
      },
      {
        toolProviders: [
          {
            connectorIdentifier: 'state-mock',
            identifier: 'state-alias',
            name: 'State Alias',
          },
        ],
      },
    );

    expect(result.manifestMap['state-alias']).toMatchObject({
      identifier: 'state-alias',
      mcpParams: connectorManifest.mcpParams,
      meta: { title: 'State Alias' },
    });
    expect(result.tools.map(({ function: fn }) => fn.name)).toEqual(['state-alias____add____mcp']);
    expect(result.enabledToolIds).toEqual(['state-alias']);
    expect(result.executorMap['state-alias']).toBe('server');
    expect(result.sourceMap['state-alias']).toBe('mcp');
  });

  it('replaces the matching provider and preserves unrelated tools', () => {
    const slackManifest = {
      api: [{ description: 'Real send', name: 'send_message', parameters: {} }],
      identifier: 'slack-mcp',
      mcpParams: { name: 'slack-mcp', type: 'http', url: 'https://mock.example.com/mcp' },
      meta: { title: 'Real Slack' },
      type: 'mcp' as const,
    };
    const webManifest = {
      api: [{ description: 'Search', name: 'search', parameters: {} }],
      identifier: 'web',
      meta: { title: 'Web' },
      type: 'default' as const,
    };

    const result = injectEvalToolEnvironment(
      {
        enabledToolIds: ['slack-mcp', 'web'],
        executorMap: {},
        manifestMap: { 'slack-mcp': slackManifest, 'web': webManifest },
        sourceMap: { 'slack-mcp': 'mcp', 'web': 'builtin' },
        tools: [
          ...generateToolsFromManifest(slackManifest),
          ...generateToolsFromManifest(webManifest),
        ],
      },
      {
        toolProviders: [
          {
            connectorIdentifier: 'slack-mcp',
            identifier: 'slack-alias',
            name: 'Slack Alias',
          },
        ],
      },
    );

    expect(result.manifestMap['slack-alias']).toMatchObject({ identifier: 'slack-alias' });
    expect(result.manifestMap.web).toBe(webManifest);
    expect(result.tools).toHaveLength(2);
    expect(result.tools.map(({ function: fn }) => fn.name)).toEqual(
      expect.arrayContaining(['web____search', 'slack-alias____send_message____mcp']),
    );
    expect(result.executorMap['slack-alias']).toBe('server');
    expect(result.sourceMap['slack-alias']).toBe('mcp');
    expect(result.enabledToolIds).toEqual(['web', 'slack-alias']);
  });
});
