import { log } from '../utils/logger';
import { getValidToken } from './refresh';

interface ResolveTokenOptions {
  serviceToken?: string;
  token?: string;
  userId?: string;
}

interface ResolvedAuth {
  token: string;
  tokenType: 'apiKey' | 'jwt' | 'serviceToken';
  userId: string;
}

/**
 * Parse the `sub` claim from a JWT without verifying the signature.
 */
function parseJwtSub(token: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.sub;
  } catch {
    return undefined;
  }
}

/**
 * Resolve an access token from explicit options or stored credentials.
 * Exits the process if no token can be resolved.
 */
export async function resolveToken(options: ResolveTokenOptions): Promise<ResolvedAuth> {
  // LOBEHUB_JWT env var takes highest priority (used by server-side sandbox execution)
  const envJwt = process.env.LOBEHUB_JWT;
  if (envJwt) {
    const userId = parseJwtSub(envJwt);
    if (!userId) {
      log.error('Could not extract userId from LOBEHUB_JWT.');
      process.exit(1);
    }
    log.debug('Using LOBEHUB_JWT from environment');
    return { token: envJwt, tokenType: 'jwt', userId };
  }

  // Explicit token takes priority
  if (options.token) {
    const userId = parseJwtSub(options.token);
    if (!userId) {
      log.error('Could not extract userId from token. Provide --user-id explicitly.');
      process.exit(1);
    }
    return { token: options.token, tokenType: 'jwt', userId };
  }

  if (options.serviceToken) {
    if (!options.userId) {
      log.error('--user-id is required when using --service-token');
      process.exit(1);
    }
    return { token: options.serviceToken, tokenType: 'serviceToken', userId: options.userId };
  }

  // Try stored credentials
  const result = await getValidToken();
  if (result) {
    log.debug('Using stored credentials');
    const { credentials } = result;

    if (credentials.tokenType === 'apiKey') {
      return { token: credentials.apiKey, tokenType: 'apiKey', userId: credentials.userId };
    }

    const userId = parseJwtSub(credentials.accessToken);
    if (!userId) {
      log.error("Stored token is invalid. Run 'lh login' again.");
      process.exit(1);
    }

    return { token: credentials.accessToken, tokenType: 'jwt', userId };
  }

  log.error("No authentication found. Run 'lh login' first, or provide --token.");
  process.exit(1);
}
