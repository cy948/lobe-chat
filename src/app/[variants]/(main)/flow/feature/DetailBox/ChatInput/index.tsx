'use client';

import { memo } from 'react';
import { type ActionKeys, ChatInputProvider, DesktopChatInput } from '@/features/ChatInput';
import WideScreenContainer from '@/features/Conversation/components/WideScreenContainer';
import { useSendThreadMessage } from './useSend';
import { useFlowStore } from '@/store/flow';
import { useChatStore } from '@/store/chat';

const threadActions: ActionKeys[] = ['typo', 'stt', 'portalToken', 'model'];

const Desktop = memo(() => {
  const { send, disabled, generating, stop } = useSendThreadMessage();

  return (
    <WideScreenContainer>
      <ChatInputProvider
        chatInputEditorRef={(instance) => {
          if (!instance) return;
          useChatStore.setState({ mainInputEditor: instance });
        }}
        leftActions={threadActions}
        onSend={() => {
          send();
        }}
        sendButtonProps={{
          disabled,
          generating,
          onStop: stop,
          shape: 'round',
        }}
      >
        <DesktopChatInput />
      </ChatInputProvider>
    </WideScreenContainer>
  );
});

export default Desktop;
