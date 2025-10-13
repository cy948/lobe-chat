import React, { memo, useCallback } from 'react';
import { Flexbox } from 'react-layout-kit';

import { SkeletonList } from '@/features/Conversation';
import VirtualizedList from './VirtualizedList'
// import { useFetchThreads } from '@/hooks/useFetchThreads';

import ThreadChatItem from './ChatItem';
import { useFlowStore, canvasSelectors } from '@/store/flow';

interface ChatListProps {
  mobile?: boolean;
}

const ChatList = memo(({ mobile }: ChatListProps) => {
  const [isInit, data] = useFlowStore((s) => [s.isDetailBoxInitialized, canvasSelectors.getActiveNodeMessageIds(s)]);

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
      <VirtualizedList dataSource={data} itemContent={itemContent} mobile={mobile} />
    </Flexbox>
  );
});

export default ChatList;
