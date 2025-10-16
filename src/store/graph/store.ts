import { subscribeWithSelector } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import { createWithEqualityFn } from 'zustand/traditional';
import { StateCreator } from 'zustand/vanilla';

import { createDevtools } from '../middleware/createDevtools';
import { GraphStoreState, initialState } from './initialState';
import { GraphCanvasAction, graphCanvas } from './slices/canvas/action';
import { GraphChatAction, graphChat } from './slices/chat/action';
import { GraphMessageAction, graphMessage } from './slices/message/action';
import { GraphPortalAction, graphPortal } from './slices/portal/action';
import { GraphTopicAction, graphTopic } from './slices/topic/action';

//  ===============  聚合 createStoreFn ============ //
export interface GraphStoreAction
  extends GraphCanvasAction,
    GraphMessageAction,
    GraphPortalAction,
    GraphChatAction,
    GraphTopicAction {}

export type GraphStore = GraphStoreAction & GraphStoreState;

const createStore: StateCreator<GraphStore, [['zustand/devtools', never]]> = (...parameters) => ({
  ...initialState,
  ...graphCanvas(...parameters),
  ...graphMessage(...parameters),
  ...graphPortal(...parameters),
  ...graphChat(...parameters),
  ...graphTopic(...parameters),
});

//  ===============  实装 useStore ============ //
const devtools = createDevtools('flow');

export const useGraphStore = createWithEqualityFn<GraphStore>()(
  subscribeWithSelector(
    devtools(createStore, {
      name: 'lobe-graph-store',
    }),
  ),
  shallow,
);

export const getGraphStoreState = () => useGraphStore.getState();
