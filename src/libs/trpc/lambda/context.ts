import type { Context as OtContext } from '@lobechat/observability-otel/api';
import type { ClientSecretPayload } from '@lobechat/types';
import { parse } from 'cookie';
import debug from 'debug';
import type { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { getServerDB } from '@/database/core/db-adaptor';
import { ApiKeyModel } from '@/database/models/apiKey';
import { authEnv, LOBE_CHAT_AUTH_HEADER, LOBE_CHAT_OIDC_AUTH_HEADER } from '@/envs/auth';
import { extractTraceContext } from '@/libs/observability/traceparent';
import { validateOIDCJWT } from '@/libs/oidc-provider/jwt';
import { isApiKeyExpired, validateApiKeyFormat } from '@/utils/apiKey';

const log = debug('lobe-trpc:lambda:context');
const LOBE_CHAT_API_KEY_HEADER = 'X-API-Key';

const extractClientIp = (request: NextRequest): string | undefined => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ip = forwardedFor.split(',')[0]?.trim();
    if (ip) return ip;
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return undefined;
};

const validateApiKeyUserId = async (apiKey: string): Promise<string | null> => {
  if (!validateApiKeyFormat(apiKey)) return null;

  try {
    const db = await getServerDB();
    const apiKeyModel = new ApiKeyModel(db, '');
    const apiKeyRecord = await apiKeyModel.findByKey(apiKey);

    if (!apiKeyRecord) return null;
    if (!apiKeyRecord.enabled) return null;
    if (isApiKeyExpired(apiKeyRecord.expiresAt)) return null;

    const userApiKeyModel = new ApiKeyModel(db, apiKeyRecord.userId);
    void userApiKeyModel.updateLastUsed(apiKeyRecord.id).catch((error) => {
      log('Failed to update API key last used timestamp: %O', error);
      console.error('Failed to update API key last used timestamp:', error);
    });

    return apiKeyRecord.userId;
  } catch (error) {
    log('API key authentication failed: %O', error);
    console.error('API key authentication failed, trying other methods:', error);
    return null;
  }
};

export interface OIDCAuth {
  [key: string]: any;
  payload: any;
  sub: string;
}

export interface AuthContext {
  authorizationHeader?: string | null;
  clientIp?: string | null;
  jwtPayload?: ClientSecretPayload | null;
  marketAccessToken?: string;
  oidcAuth?: OIDCAuth | null;
  resHeaders?: Headers;
  traceContext?: OtContext;
  userAgent?: string;
  userId?: string | null;
}

export const createContextInner = async (params?: {
  authorizationHeader?: string | null;
  clientIp?: string | null;
  marketAccessToken?: string;
  oidcAuth?: OIDCAuth | null;
  traceContext?: OtContext;
  userAgent?: string;
  userId?: string | null;
}): Promise<AuthContext> => {
  log('createContextInner called with params: %O', params);
  const responseHeaders = new Headers();

  return {
    authorizationHeader: params?.authorizationHeader,
    clientIp: params?.clientIp,
    marketAccessToken: params?.marketAccessToken,
    oidcAuth: params?.oidcAuth,
    resHeaders: responseHeaders,
    traceContext: params?.traceContext,
    userAgent: params?.userAgent,
    userId: params?.userId,
  };
};

export type LambdaContext = Awaited<ReturnType<typeof createContextInner>>;

export const createLambdaContext = async (request: NextRequest): Promise<LambdaContext> => {
  const isDebugApi = request.headers.get('lobe-auth-dev-backend-api') === '1';
  const isMockUser = process.env.ENABLE_MOCK_DEV_USER === '1';

  if (process.env.NODE_ENV === 'development' && (isDebugApi || isMockUser)) {
    return createContextInner({
      authorizationHeader: request.headers.get(LOBE_CHAT_AUTH_HEADER),
      userId: process.env.MOCK_DEV_USER_ID,
    });
  }

  log('createLambdaContext called for request');

  const authorization = request.headers.get(LOBE_CHAT_AUTH_HEADER);
  const userAgent = request.headers.get('user-agent') || undefined;
  const clientIp = extractClientIp(request);
  const cookieHeader = request.headers.get('cookie');
  const cookies = cookieHeader ? parse(cookieHeader) : {};
  const marketAccessToken = cookies.mp_token;
  const traceContext = extractTraceContext(request.headers);

  log('marketAccessToken from cookie:', marketAccessToken ? '[HIDDEN]' : 'undefined');

  const commonContext = {
    authorizationHeader: authorization,
    clientIp,
    marketAccessToken,
    userAgent,
  };

  log('LobeChat Authorization header: %s', authorization ? 'exists' : 'not found');

  const apiKeyToken = request.headers.get(LOBE_CHAT_API_KEY_HEADER)?.trim();
  log('X-API-Key header: %s', apiKeyToken ? 'exists' : 'not found');

  if (apiKeyToken) {
    const apiKeyUserId = await validateApiKeyUserId(apiKeyToken);

    if (!apiKeyUserId) {
      log('API key authentication failed; rejecting request without fallback auth');

      return createContextInner({
        ...commonContext,
        traceContext,
        userId: null,
      });
    }

    log('API key authentication successful, userId: %s', apiKeyUserId);

    return createContextInner({
      ...commonContext,
      traceContext,
      userId: apiKeyUserId,
    });
  }

  if (authEnv.ENABLE_OIDC) {
    log('OIDC enabled, attempting OIDC authentication');
    const oidcAuthToken = request.headers.get(LOBE_CHAT_OIDC_AUTH_HEADER);
    log('Oidc-Auth header: %s', oidcAuthToken ? 'exists' : 'not found');

    try {
      if (oidcAuthToken) {
        const tokenInfo = await validateOIDCJWT(oidcAuthToken);
        const oidcAuth: OIDCAuth = {
          payload: tokenInfo.tokenData,
          ...tokenInfo.tokenData,
          sub: tokenInfo.userId,
        };

        log('OIDC authentication successful, userId: %s', tokenInfo.userId);

        return createContextInner({
          ...commonContext,
          oidcAuth,
          traceContext,
          userId: tokenInfo.userId,
        });
      }
    } catch (error) {
      if (oidcAuthToken) {
        log('OIDC authentication failed, error: %O', error);
        console.error('OIDC authentication failed, trying other methods:', error);
      }
    }
  }

  log('Attempting Better Auth authentication');

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    const userId = session?.user?.id;

    if (userId) {
      log('Better Auth authentication successful, userId: %s', userId);
    } else {
      log('Better Auth authentication failed, no valid session');
    }

    return createContextInner({
      ...commonContext,
      traceContext,
      userId,
    });
  } catch (error) {
    log('Better Auth authentication error: %O', error);
    console.error('better auth err', error);
  }

  log('All authentication methods attempted, returning final context, userId: not authenticated');

  return createContextInner({ ...commonContext, traceContext });
};
