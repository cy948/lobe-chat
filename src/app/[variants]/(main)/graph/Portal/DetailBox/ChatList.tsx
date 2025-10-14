import React, { memo, useCallback } from 'react';
import { Flexbox } from 'react-layout-kit';

import { SkeletonList } from '@/features/Conversation';
import VirtualizedList from './VirtualizedList'

import ThreadChatItem from './ChatItem';
import { useGraphStore, messageSelectors } from '@/store/graph';

interface ChatListProps {
  mobile?: boolean;
}

const ChatList = memo(({ mobile }: ChatListProps) => {
  // const [isInit, data] = useFlowStore((s) => [s.isDetailBoxInitialized, canvasSelectors.getActiveNodeMessageIds(s)]);

  const [isInit, data] = useGraphStore((s) => [
    s.isStateInit,
    messageSelectors.getActiveNodeMessageIds(s) || []
  ])

  // useFetchThreads();

  const itemContent = useCallback(
    (index: number, id: string) => <ThreadChatItem id={id} index={index} />,
    [mobile],
  );

  if (!isInit) {
    console.log("Detail box not initialized");
    return (
      <Flexbox flex={1} height={'100%'}>
        <SkeletonList mobile={mobile} />
      </Flexbox>
    );
  }

  return (
    <Flexbox
      flex={1}
      style={{
        overflowX: 'hidden',
        overflowY: 'auto',
        position: 'relative',
      }}
      width={'100%'}
    >
      {data && <VirtualizedList dataSource={data} itemContent={itemContent} mobile={mobile} />}
    </Flexbox>
  );
});

export default ChatList;
