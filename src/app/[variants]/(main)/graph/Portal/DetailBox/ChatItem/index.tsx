import React, { memo } from 'react';

import { useAgentStore } from '@/store/agent';
import { agentChatConfigSelectors } from '@/store/agent/selectors';

import ChatItem from './ChatItem';
import { messageSelectors, useGraphStore } from '@/store/graph';

export interface ThreadChatItemProps {
  id: string;
  index: number;
}

const ThreadChatItem = memo<ThreadChatItemProps>(({ id, index }) => {
  const [historyLength] = useGraphStore((s) => [messageSelectors.getActiveNodeMessageIds(s)?.length || 0]);

  const enableHistoryDivider = useAgentStore(
    agentChatConfigSelectors.enableHistoryDivider(historyLength, index),
  );

  return (
    <ChatItem enableHistoryDivider={enableHistoryDivider} id={id} inPortalThread index={index} />
  );
});

ThreadChatItem.displayName = 'ThreadChatItem';

export default ThreadChatItem;
