import React, { memo } from 'react';

import ChatItem from './ChatItem';
import ActionsBar from './ActionsBar';
import { useAgentStore } from '@/store/agent';
import { agentChatConfigSelectors } from '@/store/agent/selectors';

import { useFlowStore, canvasSelectors } from '@/store/flow';

export interface ThreadChatItemProps {
  id: string;
  index: number;
}

const ThreadChatItem = memo<ThreadChatItemProps>(({ id, index }) => {
  const [historyLength] = useFlowStore((s) => [
    canvasSelectors.getActiveNodeMessageIds(s).length,
  ]);

  const enableHistoryDivider = useAgentStore(
    agentChatConfigSelectors.enableHistoryDivider(historyLength, index),
  );

  return (
    <ChatItem
      actionBar={<ActionsBar id={id} index={index} />}
      enableHistoryDivider={enableHistoryDivider}
      id={id}
      inPortalThread
      index={index}
    />
  );
});

ThreadChatItem.displayName = 'ThreadChatItem';

export default ThreadChatItem;
