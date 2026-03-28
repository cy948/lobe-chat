import debug from 'debug';

import { BaseProcessor } from '../base/BaseProcessor';
import type { PipelineContext, ProcessorOptions } from '../types';

declare module '../types' {
  interface PipelineContextMetadataOverrides {
    toolMessageReorder?: {
      originalCount: number;
      removedInvalidTools: number;
      reorderedCount: number;
    };
  }
}

const log = debug('context-engine:processor:ToolMessageReorder');

const DEFAULT_TOOL_FAILURE_CONTENT = JSON.stringify({
  error: 'Tool call failed',
  success: false,
  synthetic: true,
});

interface ToolMessageReorderDiagnostics {
  dedupedToolCalls: number;
  droppedDuplicateTools: number;
  droppedOrphanTools: number;
  generatedSyntheticTools: number;
  reorderedTools: number;
}

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

    const diagnostics: ToolMessageReorderDiagnostics = {
      dedupedToolCalls: 0,
      droppedDuplicateTools: 0,
      droppedOrphanTools: 0,
      generatedSyntheticTools: 0,
      reorderedTools: 0,
    };
    const messages = this.reorderToolMessages(clonedContext.messages, diagnostics);

    const originalCount = clonedContext.messages.length;
    const reorderedCount = messages.length;

    clonedContext.messages = messages;

    clonedContext.metadata.toolMessageReorder = {
      originalCount,
      removedInvalidTools: diagnostics.droppedDuplicateTools + diagnostics.droppedOrphanTools,
      reorderedCount,
    };

    log('Tool message normalization completed %O', clonedContext.metadata.toolMessageReorder);

    return this.markAsExecuted(clonedContext);
  }

  private getToolMessageContent(message: any): string {
    if (typeof message.content === 'string' && message.content.length > 0) return message.content;

    const pluginErrorMessage =
      typeof message.pluginError?.message === 'string' ? message.pluginError.message : undefined;

    if (pluginErrorMessage) return pluginErrorMessage;

    return DEFAULT_TOOL_FAILURE_CONTENT;
  }

  private createSyntheticToolMessage(toolCall: any): any {
    return {
      content: DEFAULT_TOOL_FAILURE_CONTENT,
      ...(toolCall.function?.name && { name: toolCall.function.name }),
      role: 'tool',
      tool_call_id: toolCall.id,
    };
  }

  private reorderToolMessages(messages: any[], diagnostics: ToolMessageReorderDiagnostics): any[] {
    const validToolCallIds = new Set<string>();
    const toolMessages = new Map<string, { index: number; message: any }>();

    for (const message of messages) {
      if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) continue;

      const seenToolCallIds = new Set<string>();
      for (const toolCall of message.tool_calls) {
        if (!toolCall?.id) continue;

        if (seenToolCallIds.has(toolCall.id)) {
          diagnostics.dedupedToolCalls++;
          continue;
        }

        seenToolCallIds.add(toolCall.id);
        validToolCallIds.add(toolCall.id);
      }
    }

    for (const [index, message] of messages.entries()) {
      if (message.role !== 'tool') continue;

      if (!message.tool_call_id || !validToolCallIds.has(message.tool_call_id)) {
        diagnostics.droppedOrphanTools++;
        continue;
      }

      if (toolMessages.has(message.tool_call_id)) {
        diagnostics.droppedDuplicateTools++;
        continue;
      }

      toolMessages.set(message.tool_call_id, { index, message });
    }

    const reorderedMessages: any[] = [];

    for (const [index, message] of messages.entries()) {
      if (message.role === 'tool') continue;

      if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) {
        reorderedMessages.push(message);
        continue;
      }

      const seenToolCallIds = new Set<string>();
      const normalizedToolCalls = [];

      for (const toolCall of message.tool_calls) {
        if (!toolCall?.id) continue;

        if (seenToolCallIds.has(toolCall.id)) continue;

        seenToolCallIds.add(toolCall.id);
        normalizedToolCalls.push(toolCall);
      }

      reorderedMessages.push(
        normalizedToolCalls.length === message.tool_calls.length
          ? message
          : { ...message, tool_calls: normalizedToolCalls },
      );

      for (const toolCall of normalizedToolCalls) {
        const matchedToolMessage = toolMessages.get(toolCall.id);

        if (matchedToolMessage) {
          if (matchedToolMessage.index !== index + 1) diagnostics.reorderedTools++;

          reorderedMessages.push({
            ...matchedToolMessage.message,
            content: this.getToolMessageContent(matchedToolMessage.message),
          });
          toolMessages.delete(toolCall.id);
          continue;
        }

        diagnostics.generatedSyntheticTools++;
        reorderedMessages.push(this.createSyntheticToolMessage(toolCall));
      }
    }

    return reorderedMessages;
  }
}
