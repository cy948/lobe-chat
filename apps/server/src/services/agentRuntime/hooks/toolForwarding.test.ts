import { afterEach, describe, expect, it, vi } from 'vitest';

import { createToolForwardingHook, shouldEnableEvalToolForwarding } from './toolForwarding';

const event = (overrides: Record<string, unknown> = {}) => ({
  apiName: 'searchUserMemory',
  args: { queries: ['preferences'] },
  callIndex: 2,
  identifier: 'lobe-user-memory',
  mock: vi.fn(),
  operationId: 'op-test',
  stepIndex: 3,
  ...overrides,
});

describe('createToolForwardingHook', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('only enables forwarding for eval operations', () => {
    const config = { endpoint: 'http://mock.test/v1/tool-calls', rules: [] };

    expect(shouldEnableEvalToolForwarding('eval', config)).toBe(true);
    expect(shouldEnableEvalToolForwarding('chat', config)).toBe(false);
    expect(shouldEnableEvalToolForwarding('eval', undefined)).toBe(false);
  });

  it('forwards a matching tool call and returns its mock result', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ content: 'mocked', protocolVersion: '2026-01', success: true }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const hook = createToolForwardingHook({
      endpoint: 'http://mock.test/v1/tool-calls',
      rules: [{ identifier: 'lobe-user-memory' }],
    });
    const toolEvent = event();

    await hook.handler(toolEvent as any);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://mock.test/v1/tool-calls',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Lobe-Eval-Session': 'eval:op-test' }),
        method: 'POST',
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      requestId: 'op-test:3:2',
      tool: { apiName: 'searchUserMemory', identifier: 'lobe-user-memory' },
    });
    expect(toolEvent.mock).toHaveBeenCalledWith({
      content: 'mocked',
      state: undefined,
      success: true,
    });
  });

  it('does not forward an unmatched tool call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const hook = createToolForwardingHook({
      endpoint: 'http://mock.test/v1/tool-calls',
      rules: [{ apiNames: ['addContextMemory'], identifier: 'lobe-user-memory' }],
    });
    const toolEvent = event();

    await hook.handler(toolEvent as any);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(toolEvent.mock).not.toHaveBeenCalled();
  });

  it('returns a failure mock when the server fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    const hook = createToolForwardingHook({
      endpoint: 'http://mock.test/v1/tool-calls',
      rules: [{ identifier: 'lobe-user-memory' }],
    });
    const toolEvent = event();

    await hook.handler(toolEvent as any);

    expect(toolEvent.mock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('connection refused'),
        success: false,
      }),
    );
  });

  it('preserves a mock server business failure without allowing fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: 'fixture error',
            error: { code: 'FIXTURE_ERROR', message: 'fixture error' },
            protocolVersion: '2026-01',
            success: false,
          }),
        ),
      ),
    );
    const hook = createToolForwardingHook({
      endpoint: 'http://mock.test/v1/tool-calls',
      rules: [{ identifier: 'lobe-user-memory' }],
    });
    const toolEvent = event();

    await hook.handler(toolEvent as any);

    expect(toolEvent.mock).toHaveBeenCalledWith({
      content: 'fixture error',
      error: { code: 'FIXTURE_ERROR', message: 'fixture error' },
      state: undefined,
      success: false,
    });
  });
});
