import { normalizeUrl, resolveServerUrl } from '../settings';

interface CurrentUserResponse {
  data?: {
    id?: string;
    userId?: string;
  };
  error?: string;
  message?: string;
  success?: boolean;
}

export async function getUserIdFromApiKey(apiKey: string, serverUrl?: string): Promise<string> {
  const normalizedServerUrl = normalizeUrl(serverUrl) || resolveServerUrl();

  const response = await fetch(`${normalizedServerUrl}/api/v1/users/me`, {
    headers: {
      'Accept-Encoding': 'identity',
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  const rawBody = await response.text();
  let body: CurrentUserResponse | undefined;

  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as CurrentUserResponse;
    } catch {
      throw new Error(
        `Failed to parse response from ${normalizedServerUrl}/api/v1/users/me: ${rawBody.slice(0, 200)}`,
      );
    }
  }

  if (!response.ok || body?.success === false) {
    throw new Error(
      body?.error || body?.message || `Request failed with status ${response.status}.`,
    );
  }

  const userId = body?.data?.id || body?.data?.userId;
  if (!userId) {
    throw new Error('Current user response did not include a user id.');
  }

  return userId;
}
