import { shallow } from 'zustand/shallow';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { createWithEqualityFn } from 'zustand/traditional';
import { StateCreator } from 'zustand/vanilla';

import { createDevtools } from '../middleware/createDevtools';
import { FlowStoreState, initialState } from './initialState';
import { flowCanvas, FlowCanvasAction } from './slices/canvas/action';
import { flowAIChat, FlowAIChatAction } from './slices/aiChat/action';
import { flowDetailBox, FlowDetailBoxAction } from './slices/detailBox/action';
import { flowMessage, FlowMessageAction } from './slices/message/action';

//  ===============  聚合 createStoreFn ============ //
export interface FlowStoreAction
    extends FlowCanvasAction,
    FlowAIChatAction,
    FlowDetailBoxAction,
    FlowMessageAction { }

export type FlowStore = FlowStoreAction & FlowStoreState;

const createStore: StateCreator<FlowStore, [['zustand/devtools', never]]> = (...parameters) => ({
    ...initialState,
    ...flowCanvas(...parameters),
    ...flowAIChat(...parameters),
    ...flowDetailBox(...parameters),
    ...flowMessage(...parameters),
});

//  ===============  实装 useStore ============ //
const devtools = createDevtools('flow');

export const useFlowStore = createWithEqualityFn<FlowStore>()(
    subscribeWithSelector(devtools(persist(createStore, {
        name: 'lobe-flow-store',
    }))), shallow);

export const getFlowStoreState = () => useFlowStore.getState();
