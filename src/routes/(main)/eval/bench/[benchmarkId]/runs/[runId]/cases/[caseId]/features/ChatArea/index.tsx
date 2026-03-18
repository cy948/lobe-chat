'use client';

import { Flexbox } from '@lobehub/ui';
import { memo, useCallback, useMemo } from 'react';

import { ChatList, ConversationProvider } from '@/features/Conversation';
import MessageItem from '@/features/Conversation/Messages';
import { useInitAgentConfig } from '@/hooks/useInitAgentConfig';
import { useOperationState } from '@/hooks/useOperationState';
import { useChatStore } from '@/store/chat';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

interface ChatAreaProps {
  agentId: string;
  isActive?: boolean;
  threadId?: string;
  topicId: string;
}

const ChatArea = memo<ChatAreaProps>(({ agentId, isActive = false, topicId, threadId }) => {
  useInitAgentConfig(agentId);

  const context = useMemo(() => ({ agentId, threadId, topicId }), [agentId, threadId, topicId]);

  const chatKey = useMemo(() => messageMapKey(context), [context]);
  const replaceMessages = useChatStore((s) => s.replaceMessages);
  const messages = useChatStore((s) => s.dbMessagesMap[chatKey]);
  const operationState = useOperationState(context);
  const messageFetchConfig = useMemo(() => ({ refreshInterval: isActive ? 3000 : 0 }), [isActive]);

  const itemContent = useCallback(
    (index: number, id: string) => <MessageItem disableEditing id={id} index={index} />,
    [],
  );

  // Use threadId as part of key to force re-render when switching threads
  const contextKey = threadId ? `${topicId}-${threadId}` : topicId;

  return (
    <ConversationProvider
      context={context}
      hasInitMessages={!!messages}
      key={contextKey}
      messageFetchConfig={messageFetchConfig}
      messages={messages}
      operationState={operationState}
      onMessagesChange={(nextMessages, ctx) => {
        replaceMessages(nextMessages, { context: ctx });
      }}
    >
      <Flexbox
        flex={1}
        style={{ overflowX: 'hidden', overflowY: 'auto', position: 'relative' }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <ChatList disableActionsBar itemContent={itemContent} />
      </Flexbox>
    </ConversationProvider>
  );
});

export default ChatArea;
