import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { LambdaRouter } from '@/server/routers/lambda';
import type { ToolsRouter } from '@/server/routers/tools';

import { getValidToken } from '../auth/refresh';
import { OFFICIAL_SERVER_URL } from '../constants/urls';
import { loadSettings } from '../settings';
import { log } from '../utils/logger';

export type TrpcClient = ReturnType<typeof createTRPCClient<LambdaRouter>>;
export type ToolsTrpcClient = ReturnType<typeof createTRPCClient<ToolsRouter>>;

interface AuthAndServer {
  headers: Record<string, string>;
  serverUrl: string;
}

let clientInstance: TrpcClient | undefined;
let toolsClientInstance: ToolsTrpcClient | undefined;

async function getAuthAndServer(): Promise<AuthAndServer> {
  const envJwt = process.env.LOBEHUB_JWT;
  if (envJwt) {
    const serverUrl = process.env.LOBEHUB_SERVER || OFFICIAL_SERVER_URL;

    return {
      headers: { 'Oidc-Auth': envJwt },
      serverUrl: serverUrl.replace(/\/$/, ''),
    };
  }

  const result = await getValidToken();
  if (!result) {
    log.error("No authentication found. Run 'lh login' first.");
    process.exit(1);
  }

  const headers =
    result.credentials.tokenType === 'apiKey'
      ? { 'X-API-Key': result.credentials.token }
      : { 'Oidc-Auth': result.credentials.token };
  const serverUrl = loadSettings()?.serverUrl || OFFICIAL_SERVER_URL;

  return { headers, serverUrl: serverUrl.replace(/\/$/, '') };
}

export async function getTrpcClient(): Promise<TrpcClient> {
  if (clientInstance) return clientInstance;

  const { headers, serverUrl } = await getAuthAndServer();
  clientInstance = createTRPCClient<LambdaRouter>({
    links: [
      httpLink({
        headers,
        transformer: superjson,
        url: `${serverUrl}/trpc/lambda`,
      }),
    ],
  });

  return clientInstance;
}

export async function getToolsTrpcClient(): Promise<ToolsTrpcClient> {
  if (toolsClientInstance) return toolsClientInstance;

  const { headers, serverUrl } = await getAuthAndServer();
  toolsClientInstance = createTRPCClient<ToolsRouter>({
    links: [
      httpLink({
        headers,
        transformer: superjson,
        url: `${serverUrl}/trpc/tools`,
      }),
    ],
  });

  return toolsClientInstance;
}
