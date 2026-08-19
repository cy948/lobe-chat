import type { EvalToolForwardingConfig } from '@lobechat/types';
import { RequestTrigger } from '@lobechat/types';

import type { AgentHook, AgentHookEvent, ToolCallHookEvent } from './types';

interface ToolForwardingResponse {
  content?: unknown;
  error?: { code?: unknown; message?: unknown };
  protocolVersion?: unknown;
  state?: unknown;
  success?: unknown;
}

const PROTOCOL_VERSION = '2026-01';

export const shouldEnableEvalToolForwarding = (
  trigger: string | undefined,
  config: EvalToolForwardingConfig | undefined,
) => trigger === RequestTrigger.Eval && !!config;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const normalizeError = (error: unknown, fallback: string) => ({
  code:
    typeof (error as { code?: unknown } | undefined)?.code === 'string'
      ? (error as { code: string }).code
      : 'TOOL_FORWARDING_ERROR',
  message:
    typeof (error as { message?: unknown } | undefined)?.message === 'string'
      ? (error as { message: string }).message
      : fallback,
});

const matchesRule = (event: ToolCallHookEvent, config: EvalToolForwardingConfig) =>
  config.rules.some(
    (rule) =>
      rule.identifier === event.identifier &&
      (!rule.apiNames || rule.apiNames.length === 0 || rule.apiNames.includes(event.apiName)),
  );

const readResponse = async (response: Response): Promise<ToolForwardingResponse> => {
  const body = (await response.json()) as ToolForwardingResponse;
  if (body.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported tool forwarding protocol: ${String(body.protocolVersion)}`);
  }
  if (typeof body.success !== 'boolean' || typeof body.content !== 'string') {
    throw new Error('Invalid tool forwarding response');
  }
  return body;
};

export const createToolForwardingHook = (config: EvalToolForwardingConfig): AgentHook => ({
  handler: async (rawEvent: AgentHookEvent) => {
    const event = rawEvent as unknown as ToolCallHookEvent;
    if (!matchesRule(event, config)) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 5000);

    try {
      const response = await fetch(config.endpoint, {
        body: JSON.stringify({
          callIndex: event.callIndex,
          context: { mode: 'eval' },
          operationId: event.operationId,
          protocolVersion: PROTOCOL_VERSION,
          requestId: `${event.operationId}:${event.stepIndex}:${event.callIndex}`,
          stepIndex: event.stepIndex,
          tool: {
            apiName: event.apiName,
            args: event.args,
            identifier: event.identifier,
          },
        }),
        headers: {
          'Content-Type': 'application/json',
          'X-Lobe-Eval-Session': `eval:${event.operationId}`,
          'X-Lobe-Forwarding-Protocol': PROTOCOL_VERSION,
        },
        method: 'POST',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Tool forwarding server responded with HTTP ${response.status}`);
      }

      const result = await readResponse(response);
      if (!result.success) {
        const message =
          typeof result.content === 'string' ? result.content : 'Tool forwarding failed';
        event.mock({
          content: message,
          error: normalizeError(result.error, message),
          state:
            typeof result.state === 'object' && result.state
              ? (result.state as Record<string, unknown>)
              : undefined,
          success: false,
        });
        return;
      }

      event.mock({
        content: result.content as string,
        state:
          typeof result.state === 'object' && result.state
            ? (result.state as Record<string, unknown>)
            : undefined,
        success: true,
      });
    } catch (error) {
      const message = `Tool forwarding failed: ${getErrorMessage(error)}`;
      event.mock({ content: message, error: normalizeError(error, message), success: false });
    } finally {
      clearTimeout(timeout);
    }
  },
  id: 'eval-tool-forwarding',
  type: 'beforeToolCall',
});
