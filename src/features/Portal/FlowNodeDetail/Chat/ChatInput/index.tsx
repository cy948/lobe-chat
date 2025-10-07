'use client';


import { memo } from 'react';
import { type ActionKeys, ChatInputProvider, DesktopChatInput } from '@/features/ChatInput';
import WideScreenContainer from '@/features/Conversation/components/WideScreenContainer';
import { useChatStore } from '@/store/chat';
import { useSendThreadMessage } from './useSend';

const threadActions: ActionKeys[] = ['typo', 'stt', 'portalToken'];

const Desktop = memo(() => {
  const { send, disabled, generating, stop } = useSendThreadMessage();

  return (
    <WideScreenContainer>
      <ChatInputProvider
        chatInputEditorRef={(instance) => {
          if (!instance) return;
          useChatStore.setState({ threadInputEditor: instance });
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
