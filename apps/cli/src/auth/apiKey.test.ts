import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUserIdFromApiKey } from './apiKey';

describe('getUserIdFromApiKey', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests plain JSON and returns the user id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          data: {
            id: 'user-123',
          },
          success: true,
        }),
      ),
    } as any);

    await expect(getUserIdFromApiKey('sk-lh-test', 'http://localhost:3010')).resolves.toBe(
      'user-123',
    );

    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3010/api/v1/users/me', {
      headers: {
        'Accept-Encoding': 'identity',
        'Authorization': 'Bearer sk-lh-test',
      },
    });
  });

  it('includes the raw body when JSON parsing fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('<html>bad gateway</html>'),
    } as any);

    await expect(getUserIdFromApiKey('sk-lh-test', 'http://localhost:3010')).rejects.toThrow(
      'Failed to parse response from http://localhost:3010/api/v1/users/me: <html>bad gateway</html>',
    );
  });
});
