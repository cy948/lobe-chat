import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAgentStreamAuthInfo } from './http';

const { mockGetValidToken } = vi.hoisted(() => ({
  mockGetValidToken: vi.fn(),
}));

const { mockResolveToken } = vi.hoisted(() => ({
  mockResolveToken: vi.fn(),
}));

vi.mock('../auth/refresh', () => ({
  getValidToken: mockGetValidToken,
}));

vi.mock('../auth/resolveToken', () => ({
  resolveToken: mockResolveToken,
}));

describe('getAgentStreamAuthInfo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('prefers a matching stored JWT for WS auth when HTTP auth uses an API key', async () => {
    const jwtPayload = Buffer.from(JSON.stringify({ sub: 'user-123' })).toString('base64url');

    mockResolveToken.mockResolvedValue({
      serverUrl: 'http://localhost:3010',
      token: 'sk-lh-test',
      tokenType: 'apiKey',
      userId: 'user-123',
    });
    mockGetValidToken.mockResolvedValue({
      credentials: {
        accessToken: `aaa.${jwtPayload}.bbb`,
      },
    });

    await expect(getAgentStreamAuthInfo()).resolves.toEqual({
      headers: { 'X-API-Key': 'sk-lh-test' },
      serverUrl: 'http://localhost:3010',
      token: `aaa.${jwtPayload}.bbb`,
      tokenType: 'jwt',
    });
  });

  it('keeps the API key for WS auth when no matching JWT is available', async () => {
    mockResolveToken.mockResolvedValue({
      serverUrl: 'http://localhost:3010',
      token: 'sk-lh-test',
      tokenType: 'apiKey',
      userId: 'user-123',
    });
    mockGetValidToken.mockResolvedValue(null);

    await expect(getAgentStreamAuthInfo()).resolves.toEqual({
      headers: { 'X-API-Key': 'sk-lh-test' },
      serverUrl: 'http://localhost:3010',
      token: 'sk-lh-test',
      tokenType: 'apiKey',
    });
  });
});
