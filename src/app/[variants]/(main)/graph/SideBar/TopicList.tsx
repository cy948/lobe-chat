'use client';

import isEqual from 'fast-deep-equal';
import React, { memo, useCallback, useMemo, useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

import { useGraphStore } from '@/store/graph';
import { GraphTopic } from '@/types/graph';

import TopicItem from './TopicItem';

const TopicList = memo(() => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const [activeStateId] = useGraphStore((s) => [s.activeStateId]);
  const activeStateList = useGraphStore((s) => s.stateTopicList, isEqual);

  const topics = useMemo(
    () => [
      // { favorite: false, id: 'default', title: t('defaultTitle') } as ChatTopic,
      // ...(activeTopicList || []),
      ...(activeStateList || []),
    ],
    [activeStateList],
  );

  const itemContent = useCallback(
    (index: number, { id, title, favorite }: GraphTopic) =>
      index === 0 ? (
        <TopicItem active={!activeStateId} fav={favorite} title={title} />
      ) : (
        <TopicItem active={activeStateId === id} fav={favorite} id={id} key={id} title={title} />
      ),
    [activeStateId],
  );

  const activeIndex = topics.findIndex((topic) => topic.id === activeStateId);

  return (
    <Virtuoso
      // components={{ ScrollSeekPlaceholder: Placeholder }}
      computeItemKey={(_, item) => item.id}
      data={topics}
      defaultItemHeight={44}
      initialTopMostItemIndex={Math.max(activeIndex, 0)}
      itemContent={itemContent}
      overscan={44 * 10}
      ref={virtuosoRef}
      // scrollSeekConfiguration={{
      //   enter: (velocity) => Math.abs(velocity) > 350,
      //   exit: (velocity) => Math.abs(velocity) < 10,
      // }}
    />
  );
});

TopicList.displayName = 'TopicList';

export default TopicList;
