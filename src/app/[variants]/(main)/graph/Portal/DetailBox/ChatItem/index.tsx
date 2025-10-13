import React, { memo } from 'react';

import { useAgentStore } from '@/store/agent';
import { agentChatConfigSelectors } from '@/store/agent/selectors';
import { canvasSelectors, useFlowStore } from '@/store/flow';

import ChatItem from './ChatItem';

export interface ThreadChatItemProps {
  id: string;
  index: number;
}

const ThreadChatItem = memo<ThreadChatItemProps>(({ id, index }) => {
  const [historyLength] = useFlowStore((s) => [canvasSelectors.getActiveNodeMessageIds(s).length]);

  const enableHistoryDivider = useAgentStore(
    agentChatConfigSelectors.enableHistoryDivider(historyLength, index),
  );

  return (
    <ChatItem enableHistoryDivider={enableHistoryDivider} id={id} inPortalThread index={index} />
  );
});

ThreadChatItem.displayName = 'ThreadChatItem';

export default ThreadChatItem;
