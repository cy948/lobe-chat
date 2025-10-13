import { useMemo, useState } from 'react';

import { useGeminiChineseWarning } from '@/hooks/useGeminiChineseWarning';
import { getAgentStoreState } from '@/store/agent';
import { agentSelectors } from '@/store/agent/slices/chat';
import { useChatStore } from '@/store/chat';
import { SendMessageParams } from '@/types/message';
import { flowAIChatSelectors, useFlowStore } from '@/store/flow';

export type UseSendMessageParams = Pick<
  SendMessageParams,
  'onlyAddUserMessage' | 'isWelcomeQuestion'
>;

export const useSendThreadMessage = () => {
  const [loading, setLoading] = useState(false);
  const canNotSend = useFlowStore((s) => flowAIChatSelectors.isEditorButtonDisabled(s));
  const generating = useFlowStore((s) => flowAIChatSelectors.isFlowAIGenerating(s));
  const stop = useFlowStore((s) => s.stopGenerateMessage);
  const [sendMessage, updateInputMessage] = useFlowStore((s) => [
    s.sendMessage,
    s.updateInputMessage,
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

    sendMessage({ message: inputMessage, ...params });

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
