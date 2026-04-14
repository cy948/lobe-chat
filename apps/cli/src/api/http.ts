import { getValidToken } from '../auth/refresh';
import { resolveToken } from '../auth/resolveToken';
import { CLI_API_KEY_ENV } from '../constants/auth';
import { resolveServerUrl } from '../settings';
import { log } from '../utils/logger';

export interface AuthInfo {
  accessToken: string;
  /** Headers required for /webapi/* endpoints (Oidc-Auth for authentication) */
  headers: Record<string, string>;
  serverUrl: string;
}

export interface AgentStreamAuthInfo {
  headers: Record<string, string>;
  serverUrl: string;
  token: string;
  tokenType: 'apiKey' | 'jwt' | 'serviceToken';
}

function parseJwtSub(token: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.sub;
  } catch {
    return undefined;
  }
}

export async function getAuthInfo(): Promise<AuthInfo> {
  const result = await getValidToken();
  if (!result) {
    if (process.env[CLI_API_KEY_ENV]) {
      log.error(
        `API key auth from ${CLI_API_KEY_ENV} is not supported for /webapi/* routes. Run OIDC login instead.`,
      );
      process.exit(1);
    }

    log.error("No authentication found. Run 'lh login' first.");
    process.exit(1);
  }

  const accessToken = result!.credentials.accessToken;
  const serverUrl = resolveServerUrl();

  return {
    accessToken,
    headers: {
      'Content-Type': 'application/json',
      'Oidc-Auth': accessToken,
    },
    serverUrl,
  };
}

export async function getAgentStreamAuthInfo(): Promise<AgentStreamAuthInfo> {
  const auth = await resolveToken({});
  const headers =
    auth.tokenType === 'apiKey' ? { 'X-API-Key': auth.token } : { 'Oidc-Auth': auth.token };
  let streamToken = auth.token;
  let streamTokenType = auth.tokenType;

  // Keep API key auth for HTTP requests, but prefer a matching stored JWT for WS auth.
  // This preserves all-stream-over-WS behavior while avoiding API-key-specific gateway issues.
  if (auth.tokenType === 'apiKey') {
    const stored = await getValidToken();
    const accessToken = stored?.credentials.accessToken;
    const storedUserId = accessToken ? parseJwtSub(accessToken) : undefined;

    if (accessToken && storedUserId === auth.userId) {
      streamToken = accessToken;
      streamTokenType = 'jwt';
    }
  }

  return {
    headers,
    serverUrl: auth.serverUrl,
    token: streamToken,
    tokenType: streamTokenType,
  };
}
