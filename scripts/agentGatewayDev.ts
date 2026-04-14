import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';

import { importJWK, jwtVerify } from 'jose';
import { type WebSocket, WebSocketServer } from 'ws';

type TokenType = 'apiKey' | 'jwt' | 'serviceToken';

interface AgentStreamEvent {
  data: any;
  operationId: string;
  stepIndex: number;
  timestamp: number;
  type: string;
}

interface OperationState {
  completed: boolean;
  events: Array<{ event: AgentStreamEvent; id: string }>;
  nextEventId: number;
  sockets: Set<AuthedSocket>;
  userId?: string;
}

interface AuthedSocket extends WebSocket {
  authenticated?: boolean;
  operationId?: string;
  serverUrl?: string;
  userId?: string;
}

interface CurrentUserResponse {
  data?: {
    id?: string;
    userId?: string;
  };
  error?: string;
  message?: string;
  success?: boolean;
}

const AGENT_GATEWAY_PORT = Number.parseInt(process.env.AGENT_GATEWAY_PORT || '8788', 10);
const AGENT_GATEWAY_SERVICE_TOKEN = process.env.AGENT_GATEWAY_SERVICE_TOKEN;
const JWKS_KEY = process.env.JWKS_KEY;

if (!AGENT_GATEWAY_SERVICE_TOKEN) {
  throw new Error('AGENT_GATEWAY_SERVICE_TOKEN is required');
}

if (!JWKS_KEY) {
  throw new Error('JWKS_KEY is required');
}

const operations = new Map<string, OperationState>();
const publicKeyPromise = getPublicKey(JWKS_KEY);

function getOrCreateOperation(operationId: string): OperationState {
  let operation = operations.get(operationId);

  if (!operation) {
    operation = {
      completed: false,
      events: [],
      nextEventId: 1,
      sockets: new Set(),
    };
    operations.set(operationId, operation);
  }

  return operation;
}

async function getPublicKey(jwksString: string) {
  const jwks = JSON.parse(jwksString) as { keys?: any[] };
  const privateKey = jwks.keys?.find((key) => key.alg === 'RS256' && key.kty === 'RSA');

  if (!privateKey) {
    throw new Error('No RS256 RSA key found in JWKS_KEY');
  }

  return importJWK(
    {
      alg: privateKey.alg,
      e: privateKey.e,
      kid: privateKey.kid,
      kty: privateKey.kty,
      n: privateKey.n,
      use: privateKey.use,
    },
    'RS256',
  );
}

async function verifyJwtToken(token: string): Promise<{ userId: string }> {
  const publicKey = await publicKeyPromise;
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });

  if (!payload.sub) throw new Error('Missing sub claim');

  return { userId: String(payload.sub) };
}

async function verifyApiKeyToken(serverUrl: string, token: string): Promise<{ userId: string }> {
  const normalizedServerUrl = serverUrl.replace(/\/$/, '');
  const response = await fetch(`${normalizedServerUrl}/api/v1/users/me`, {
    headers: {
      'Accept-Encoding': 'identity',
      'Authorization': `Bearer ${token}`,
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
  if (!userId) throw new Error('Current user response did not include a user id.');

  return { userId };
}

async function resolveSocketUserId(params: {
  serverUrl?: string;
  storedUserId?: string;
  token?: string;
  tokenType?: TokenType;
}) {
  const { serverUrl, storedUserId, token, tokenType } = params;

  if (!token) throw new Error('Missing token');

  if (tokenType === 'apiKey') {
    if (!serverUrl) throw new Error('Missing serverUrl');
    return verifyApiKeyToken(serverUrl, token);
  }

  if (tokenType === 'serviceToken') {
    if (token !== AGENT_GATEWAY_SERVICE_TOKEN) throw new Error('Invalid service token');
    if (!storedUserId) throw new Error('Missing userId');
    return { userId: storedUserId };
  }

  return verifyJwtToken(token);
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  ws.send(JSON.stringify(payload));
}

function appendEvent(operationId: string, event: AgentStreamEvent) {
  const operation = getOrCreateOperation(operationId);
  const id = String(operation.nextEventId++);

  operation.events.push({ event, id });

  for (const socket of operation.sockets) {
    if (!socket.authenticated || socket.readyState !== socket.OPEN) continue;
    sendJson(socket, { event, id, type: 'agent_event' });
  }

  if (event.type === 'agent_runtime_end' || event.type === 'error') {
    operation.completed = true;
  }

  return id;
}

async function readJsonBody(request: Request | IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function isAuthorized(request: IncomingMessage) {
  return request.headers.authorization === `Bearer ${AGENT_GATEWAY_SERVICE_TOKEN}`;
}

function writeJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function handleToolResult(socket: AuthedSocket, payload: any) {
  if (!socket.serverUrl) throw new Error('Missing serverUrl');

  const response = await fetch(`${socket.serverUrl}/api/agent/tool-result`, {
    body: JSON.stringify({
      content: payload.content,
      error: payload.error,
      success: payload.success,
      toolCallId: payload.toolCallId,
    }),
    headers: {
      'Authorization': `Bearer ${AGENT_GATEWAY_SERVICE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`tool-result forward failed: ${response.status} ${await response.text()}`);
  }
}

const server = createServer(async (request, response) => {
  try {
    if (!request.url) {
      writeJson(response, 400, { error: 'Missing URL' });
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      writeJson(response, 200, { ok: true });
      return;
    }

    if (!isAuthorized(request)) {
      writeJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/operations/init') {
      const body = (await readJsonBody(request)) as { operationId?: string; userId?: string };

      if (!body.operationId) {
        writeJson(response, 400, { error: 'operationId is required' });
        return;
      }

      const operation = getOrCreateOperation(body.operationId);
      operation.userId = body.userId;
      writeJson(response, 204, {});
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/operations/push-event') {
      const body = (await readJsonBody(request)) as {
        event?: AgentStreamEvent;
        operationId?: string;
      };

      if (!body.operationId || !body.event) {
        writeJson(response, 400, { error: 'operationId and event are required' });
        return;
      }

      appendEvent(body.operationId, body.event);
      writeJson(response, 204, {});
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/operations/tool-execute') {
      const body = (await readJsonBody(request)) as {
        data?: Record<string, unknown>;
        operationId?: string;
      };

      if (!body.operationId || !body.data) {
        writeJson(response, 400, { error: 'operationId and data are required' });
        return;
      }

      const operation = getOrCreateOperation(body.operationId);
      const hasAuthenticatedSocket = [...operation.sockets].some(
        (socket) => socket.authenticated && socket.readyState === socket.OPEN,
      );

      if (!hasAuthenticatedSocket) {
        writeJson(response, 503, { error: 'No connected client for operation' });
        return;
      }

      appendEvent(body.operationId, {
        data: body.data,
        operationId: body.operationId,
        stepIndex: 0,
        timestamp: Date.now(),
        type: 'tool_execute',
      });

      writeJson(response, 204, {});
      return;
    }

    writeJson(response, 404, { error: 'Not found' });
  } catch (error) {
    writeJson(response, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (socket: AuthedSocket, request) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const operationId = url.searchParams.get('operationId');

  if (!operationId) {
    socket.close(1008, 'Missing operationId');
    return;
  }

  const operation = getOrCreateOperation(operationId);
  socket.operationId = operationId;
  operation.sockets.add(socket);

  socket.on('message', async (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as any;

      if (message.type === 'auth') {
        const result = await resolveSocketUserId({
          serverUrl: message.serverUrl,
          storedUserId: operation.userId,
          token: message.token,
          tokenType: message.tokenType,
        });

        if (operation.userId && operation.userId !== result.userId) {
          throw new Error('userId mismatch');
        }

        socket.authenticated = true;
        socket.serverUrl = message.serverUrl;
        socket.userId = result.userId;
        sendJson(socket, { type: 'auth_success' });
        return;
      }

      if (!socket.authenticated) return;

      if (message.type === 'resume') {
        const lastEventId = String(message.lastEventId || '');
        const startIndex = lastEventId
          ? operation.events.findIndex((item) => item.id === lastEventId) + 1
          : 0;

        for (const item of operation.events.slice(Math.max(startIndex, 0))) {
          sendJson(socket, { event: item.event, id: item.id, type: 'agent_event' });
        }

        if (operation.completed) {
          sendJson(socket, { type: 'session_complete' });
        }

        return;
      }

      if (message.type === 'heartbeat') {
        sendJson(socket, { type: 'heartbeat_ack' });
        return;
      }

      if (message.type === 'tool_result') {
        await handleToolResult(socket, message);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      sendJson(socket, { reason, type: 'auth_failed' });
      socket.close(1008, reason);
    }
  });

  socket.on('close', () => {
    operation.sockets.delete(socket);
  });
});

server.on('upgrade', (request, socket, head) => {
  if (!request.url?.startsWith('/ws')) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(AGENT_GATEWAY_PORT, () => {
  console.log(`Agent gateway ready on http://localhost:${AGENT_GATEWAY_PORT}`);
});
