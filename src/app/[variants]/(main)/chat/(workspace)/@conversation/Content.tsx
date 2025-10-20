'use client';

import ChatList from './features/ChatList';
import GraphView from './features/GraphView';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

export default function Content() {
  const graphView = useGlobalStore((s) => systemStatusSelectors.graphView(s));
  return graphView ? <GraphView /> : <ChatList />;
}