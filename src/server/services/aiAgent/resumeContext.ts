import type { AgentRuntimeContext } from '@lobechat/agent-runtime';
import { LOADING_FLAT } from '@lobechat/const';

export const buildResumeContextFromMessages = (
  messages: any[],
  operationId: string,
): {
  initialContext: AgentRuntimeContext;
  initialMessages: any[];
} => {
  const initialMessages = [...messages];
  let existingAssistantMessageId: string | undefined;

  while (initialMessages.length > 0) {
    const lastMessage = initialMessages.at(-1);

    if (
      lastMessage?.role === 'assistant' &&
      lastMessage.content === LOADING_FLAT &&
      (!lastMessage.tools || lastMessage.tools.length === 0)
    ) {
      existingAssistantMessageId = lastMessage.id;
      initialMessages.pop();
      continue;
    }

    break;
  }

  const lastMessage = initialMessages.at(-1);
  if (!lastMessage) {
    throw new Error('Unable to infer resume context from empty trajectory');
  }

  if (lastMessage.role === 'tool') {
    let toolCount = 0;

    for (let i = initialMessages.length - 1; i >= 0; i--) {
      if (initialMessages[i]?.role !== 'tool') break;
      toolCount++;
    }

    return {
      initialContext: {
        payload: { parentMessageId: lastMessage.id },
        phase: toolCount > 1 ? 'tools_batch_result' : 'tool_result',
        session: {
          messageCount: initialMessages.length,
          sessionId: operationId,
          status: 'idle',
          stepCount: 0,
        },
      },
      initialMessages,
    };
  }

  if (lastMessage.role === 'assistant') {
    const toolsCalling = Array.isArray(lastMessage.tools) ? lastMessage.tools : [];
    const toolCalls = toolsCalling.map((tool: any) => ({
      function: {
        arguments: tool.arguments || '{}',
        name: tool.apiName,
      },
      id: tool.id,
      ...(tool.thoughtSignature ? { thoughtSignature: tool.thoughtSignature } : {}),
      type: 'function',
    }));

    return {
      initialContext: {
        payload: {
          hasToolsCalling: toolsCalling.length > 0,
          parentMessageId: lastMessage.id,
          result: {
            content: lastMessage.content || '',
            tool_calls: toolCalls,
          },
          toolsCalling,
        },
        phase: 'llm_result',
        session: {
          messageCount: initialMessages.length,
          sessionId: operationId,
          status: 'idle',
          stepCount: 0,
        },
      },
      initialMessages,
    };
  }

  if (lastMessage.role === 'user') {
    return {
      initialContext: {
        payload: {
          ...(existingAssistantMessageId ? { assistantMessageId: existingAssistantMessageId } : {}),
          isFirstMessage: initialMessages.length === 1,
          message: [{ content: lastMessage.content || '' }],
          parentMessageId: lastMessage.id,
        },
        phase: 'user_input',
        session: {
          messageCount: initialMessages.length,
          sessionId: operationId,
          status: 'idle',
          stepCount: 0,
        },
      },
      initialMessages,
    };
  }

  throw new Error(`Unsupported resume boundary: ${lastMessage.role}`);
};
