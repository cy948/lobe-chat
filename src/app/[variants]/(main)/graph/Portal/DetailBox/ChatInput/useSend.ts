import { useMemo, useState } from 'react';

import { useGeminiChineseWarning } from '@/hooks/useGeminiChineseWarning';
import { getAgentStoreState } from '@/store/agent';
import { agentSelectors } from '@/store/agent/slices/chat';
import { useChatStore } from '@/store/chat';
import { SendMessageParams } from '@/types/message';
import { flowAIChatSelectors, useFlowStore } from '@/store/flow';
import { chatSelectors, useGraphStore } from '@/store/graph';

export type UseSendMessageParams = Pick<
  SendMessageParams,
  'onlyAddUserMessage' | 'isWelcomeQuestion'
>;

export const useSendThreadMessage = () => {
  const [loading, setLoading] = useState(false);
  const [
    canNotSend,
    generating,
    sendMessage,
    updateInputMessage,
    activeNodeId,
    stop,
  ] = useGraphStore((s) => [
    chatSelectors.isEditorButtonDisabled(s),
    chatSelectors.isNodeMessageGenerating(s),
    s.sendMessage,
    s.updateInputMessage,
    s.activeNodeId,
    s.stopGenerateMessage,
  ]);
  const checkGeminiChineseWarning = useGeminiChineseWarning();

  const handleSend = async (params: UseSendMessageParams = {}) => {
    const store = useFlowStore.getState();
    const chatStore = useChatStore.getState();

    if (flowAIChatSelectors.isFlowAIGenerating(store)) return;
    const canNotSend = flowAIChatSelectors.isEditorButtonDisabled(store);

    if (canNotSend) return;

    const messageInputEditor = chatStore.mainInputEditor;

    if (!messageInputEditor) {
      console.warn('not found messageInputEditor instance');
      return;
    }

    const inputMessage = messageInputEditor.getMarkdownContent();

    // if there is no message and no image, then we should not send the message
    if (!inputMessage) return;

    // Check for Chinese text warning with Gemini model
    const agentStore = getAgentStoreState();
    const currentModel = agentSelectors.currentAgentModel(agentStore);
    const shouldContinue = await checkGeminiChineseWarning({
      model: currentModel,
      prompt: inputMessage,
      scenario: 'chat',
    });

    if (!shouldContinue) return;

    updateInputMessage(inputMessage);

    if (!activeNodeId) return;

    await sendMessage(activeNodeId, { message: inputMessage, ...params });

    updateInputMessage('');
    messageInputEditor.clearContent();
    messageInputEditor.focus();
  };

  const send = async (params: UseSendMessageParams = {}) => {
    setLoading(true);
    await handleSend(params);
    setLoading(false);
  };

  return useMemo(
    () => ({ disabled: canNotSend, generating, loading, send, stop }),
    [canNotSend, send, generating, stop, loading],
  );
};
