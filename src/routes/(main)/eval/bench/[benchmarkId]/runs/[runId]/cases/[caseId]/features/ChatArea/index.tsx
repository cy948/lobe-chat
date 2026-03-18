'use client';

import { Flexbox } from '@lobehub/ui';
import { memo, useCallback, useMemo } from 'react';

import { ChatList, ConversationProvider } from '@/features/Conversation';
import MessageItem from '@/features/Conversation/Messages';
import { useInitAgentConfig } from '@/hooks/useInitAgentConfig';

interface ChatAreaProps {
  agentId: string;
  isActive?: boolean;
  threadId?: string;
  topicId: string;
}

const ChatArea = memo<ChatAreaProps>(({ agentId, isActive = false, topicId, threadId }) => {
  useInitAgentConfig(agentId);

  const context = useMemo(() => ({ agentId, threadId, topicId }), [agentId, threadId, topicId]);
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
      key={contextKey}
      messageFetchConfig={messageFetchConfig}
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
