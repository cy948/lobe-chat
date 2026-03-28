import debug from 'debug';

import { BaseProcessor } from '../base/BaseProcessor';
import type { PipelineContext, ProcessorOptions } from '../types';

declare module '../types' {
  interface PipelineContextMetadataOverrides {
    toolMessageReorder?: {
      dedupedToolCalls: number;
      droppedDuplicateTools: number;
      droppedOrphanTools: number;
      generatedSyntheticTools: number;
      originalCount: number;
      reorderedTools: number;
      reorderedCount: number;
    };
  }
}

const log = debug('context-engine:processor:ToolMessageReorder');

interface AssistantMessageWithToolCalls {
  [key: string]: unknown;
  content?: unknown;
  role: 'assistant';
  tool_calls: Array<{
    function?: { arguments?: string; name?: string };
    id: string;
    type?: string;
  }>;
}

interface ToolMessage {
  [key: string]: unknown;
  content: string;
  name?: string;
  role: 'tool';
  tool_call_id: string;
}

interface NormalizeDiagnostics {
  dedupedToolCalls: number;
  droppedDuplicateTools: number;
  droppedOrphanTools: number;
  generatedSyntheticTools: number;
  reorderedTools: number;
}

interface NormalizeResult {
  diagnostics: NormalizeDiagnostics;
  messages: any[];
}

const DEFAULT_TOOL_FAILURE_CONTENT = JSON.stringify({
  error: 'Tool call failed',
  success: false,
  synthetic: true,
});

const isAssistantWithToolCalls = (message: any): message is AssistantMessageWithToolCalls =>
  message?.role === 'assistant' &&
  Array.isArray(message.tool_calls) &&
  message.tool_calls.some((toolCall: any) => !!toolCall?.id);

const isToolMessage = (message: any): message is ToolMessage =>
  message?.role === 'tool' &&
  typeof message.tool_call_id === 'string' &&
  message.tool_call_id.length > 0;

const createSyntheticToolMessage = (
  toolCall: AssistantMessageWithToolCalls['tool_calls'][number],
): ToolMessage => ({
  content: DEFAULT_TOOL_FAILURE_CONTENT,
  ...(toolCall.function?.name && { name: toolCall.function.name }),
  role: 'tool',
  tool_call_id: toolCall.id,
});

export const normalizeToolCallMessages = (messages: any[]): NormalizeResult => {
  const diagnostics: NormalizeDiagnostics = {
    dedupedToolCalls: 0,
    droppedDuplicateTools: 0,
    droppedOrphanTools: 0,
    generatedSyntheticTools: 0,
    reorderedTools: 0,
  };

  const toolMessagesById = new Map<string, ToolMessage>();
  const toolOriginalIndexById = new Map<string, number>();
  const assistantToolCallIds = new Set<string>();

  for (const [index, message] of messages.entries()) {
    if (message?.role !== 'tool') continue;

    if (!isToolMessage(message)) {
      diagnostics.droppedOrphanTools++;
      continue;
    }

    if (toolMessagesById.has(message.tool_call_id)) {
      diagnostics.droppedDuplicateTools++;
      continue;
    }

    toolMessagesById.set(message.tool_call_id, message);
    toolOriginalIndexById.set(message.tool_call_id, index);
  }

  const normalizedMessages: any[] = [];

  for (const [index, message] of messages.entries()) {
    if (message?.role === 'tool') continue;

    if (!isAssistantWithToolCalls(message)) {
      normalizedMessages.push(message);
      continue;
    }

    const seenToolCallIds = new Set<string>();
    const normalizedToolCalls = [];

    for (const toolCall of message.tool_calls) {
      if (!toolCall?.id) continue;

      if (seenToolCallIds.has(toolCall.id)) {
        diagnostics.dedupedToolCalls++;
        continue;
      }

      seenToolCallIds.add(toolCall.id);
      assistantToolCallIds.add(toolCall.id);
      normalizedToolCalls.push(toolCall);
    }

    const normalizedAssistant =
      normalizedToolCalls.length === message.tool_calls.length
        ? message
        : { ...message, tool_calls: normalizedToolCalls };

    normalizedMessages.push(normalizedAssistant);

    for (const toolCall of normalizedToolCalls) {
      const matchedToolMessage = toolMessagesById.get(toolCall.id);

      if (matchedToolMessage) {
        const originalToolIndex = toolOriginalIndexById.get(toolCall.id);
        if (originalToolIndex !== undefined && originalToolIndex !== index + 1) {
          diagnostics.reorderedTools++;
        }

        normalizedMessages.push(matchedToolMessage);
        toolMessagesById.delete(toolCall.id);
        toolOriginalIndexById.delete(toolCall.id);
        continue;
      }

      diagnostics.generatedSyntheticTools++;
      normalizedMessages.push(createSyntheticToolMessage(toolCall));
    }
  }

  for (const toolCallId of toolMessagesById.keys()) {
    if (!assistantToolCallIds.has(toolCallId)) {
      diagnostics.droppedOrphanTools++;
    }
  }

  return { diagnostics, messages: normalizedMessages };
};

/**
 * Reorder tool messages to ensure that tool messages are displayed in the correct order.
 * see https://github.com/lobehub/lobe-chat/pull/3155
 */
export class ToolMessageReorder extends BaseProcessor {
  readonly name = 'ToolMessageReorder';

  constructor(options: ProcessorOptions = {}) {
    super(options);
  }

  protected async doProcess(context: PipelineContext): Promise<PipelineContext> {
    const clonedContext = this.cloneContext(context);

    const { diagnostics, messages } = normalizeToolCallMessages(clonedContext.messages);

    const originalCount = clonedContext.messages.length;
    const reorderedCount = messages.length;

    clonedContext.messages = messages;

    clonedContext.metadata.toolMessageReorder = {
      dedupedToolCalls: diagnostics.dedupedToolCalls,
      droppedDuplicateTools: diagnostics.droppedDuplicateTools,
      droppedOrphanTools: diagnostics.droppedOrphanTools,
      generatedSyntheticTools: diagnostics.generatedSyntheticTools,
      originalCount,
      reorderedTools: diagnostics.reorderedTools,
      reorderedCount,
    };

    log('Tool message normalization completed %O', clonedContext.metadata.toolMessageReorder);

    return this.markAsExecuted(clonedContext);
  }
}
