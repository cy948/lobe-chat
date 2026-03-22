import { getValidToken } from '../auth/refresh';
import { OFFICIAL_SERVER_URL } from '../constants/urls';
import { loadSettings } from '../settings';
import { log } from '../utils/logger';

const SECRET_XOR_KEY = 'LobeHub · LobeHub';

function obfuscatePayloadWithXOR(payload: Record<string, any>): string {
  const jsonString = JSON.stringify(payload);
  const dataBytes = new TextEncoder().encode(jsonString);
  const keyBytes = new TextEncoder().encode(SECRET_XOR_KEY);

  const result = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    result[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  return btoa(String.fromCharCode(...result));
}

export interface AuthInfo {
  headers: Record<string, string>;
  serverUrl: string;
  token: string;
}

export async function getAuthInfo(): Promise<AuthInfo> {
  const result = await getValidToken();
  if (!result) {
    log.error("No authentication found. Run 'lh login' first.");
    process.exit(1);
  }

  if (result.credentials.tokenType === 'apiKey') {
    log.error('API key login is not supported for /webapi/* routes. Run OIDC login instead.');
    process.exit(1);
  }

  const token = result.credentials.token;
  const serverUrl = loadSettings()?.serverUrl || OFFICIAL_SERVER_URL;

  return {
    headers: {
      'Content-Type': 'application/json',
      'Oidc-Auth': token,
      'X-lobe-chat-auth': obfuscatePayloadWithXOR({}),
    },
    serverUrl: serverUrl.replace(/\/$/, ''),
    token,
  };
}
