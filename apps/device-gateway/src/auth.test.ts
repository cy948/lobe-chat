import { describe, expect, it, vi } from 'vitest';

import { resolveSocketAuth, verifyApiKeyToken } from './auth';

describe('verifyApiKeyToken', () => {
  it('requests plain JSON and parses the user id', async () => {
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

    await expect(verifyApiKeyToken('http://localhost:3010', 'sk-lh-test')).resolves.toEqual({
      userId: 'user-123',
    });

    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3010/api/v1/users/me', {
      headers: {
        'Accept-Encoding': 'identity',
        'Authorization': 'Bearer sk-lh-test',
      },
    });

    fetchSpy.mockRestore();
  });

  it('includes the raw body when JSON parsing fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('<html>bad gateway</html>'),
    } as any);

    await expect(verifyApiKeyToken('http://localhost:3010', 'sk-lh-test')).rejects.toThrow(
      'Failed to parse response from http://localhost:3010/api/v1/users/me: <html>bad gateway</html>',
    );

    fetchSpy.mockRestore();
  });
});

describe('resolveSocketAuth', () => {
  it('rejects missing token', async () => {
    const verifyApiKey = vi.fn();
    const verifyJwt = vi.fn();

    await expect(
      resolveSocketAuth({
        serviceToken: 'service-secret',
        storedUserId: 'user-123',
        verifyApiKey,
        verifyJwt,
      }),
    ).rejects.toThrow('Missing token');

    expect(verifyApiKey).not.toHaveBeenCalled();
    expect(verifyJwt).not.toHaveBeenCalled();
  });

  it('rejects the real service token when storedUserId is missing', async () => {
    const verifyApiKey = vi.fn();
    const verifyJwt = vi.fn();

    await expect(
      resolveSocketAuth({
        serviceToken: 'service-secret',
        token: 'service-secret',
        tokenType: 'serviceToken',
        verifyApiKey,
        verifyJwt,
      }),
    ).rejects.toThrow('Missing userId');

    expect(verifyApiKey).not.toHaveBeenCalled();
    expect(verifyJwt).not.toHaveBeenCalled();
  });
  it('rejects clients that only self-declare serviceToken mode', async () => {
    const verifyApiKey = vi.fn();
    const verifyJwt = vi.fn().mockRejectedValue(new Error('invalid jwt'));

    await expect(
      resolveSocketAuth({
        serviceToken: 'service-secret',
        storedUserId: 'user-123',
        token: 'attacker-token',
        tokenType: 'serviceToken',
        verifyApiKey,
        verifyJwt,
      }),
    ).rejects.toThrow('invalid jwt');

    expect(verifyApiKey).not.toHaveBeenCalled();
    expect(verifyJwt).toHaveBeenCalledWith('attacker-token');
  });

  it('treats a forged serviceToken claim with a valid JWT as JWT auth', async () => {
    const verifyApiKey = vi.fn();
    const verifyJwt = vi.fn().mockResolvedValue({ userId: 'user-123' });

    await expect(
      resolveSocketAuth({
        serviceToken: 'service-secret',
        storedUserId: 'user-123',
        token: 'valid-jwt',
        tokenType: 'serviceToken',
        verifyApiKey,
        verifyJwt,
      }),
    ).resolves.toBe('user-123');

    expect(verifyApiKey).not.toHaveBeenCalled();
    expect(verifyJwt).toHaveBeenCalledWith('valid-jwt');
  });

  it('accepts the real service token', async () => {
    const verifyApiKey = vi.fn();
    const verifyJwt = vi.fn();

    await expect(
      resolveSocketAuth({
        serviceToken: 'service-secret',
        storedUserId: 'user-123',
        token: 'service-secret',
        tokenType: 'serviceToken',
        verifyApiKey,
        verifyJwt,
      }),
    ).resolves.toBe('user-123');

    expect(verifyApiKey).not.toHaveBeenCalled();
    expect(verifyJwt).not.toHaveBeenCalled();
  });
});
