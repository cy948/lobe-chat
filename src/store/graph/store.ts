import { shallow } from 'zustand/shallow';
import { subscribeWithSelector, persist } from 'zustand/middleware';
import { createWithEqualityFn } from 'zustand/traditional';
import { StateCreator } from 'zustand/vanilla';

import { createDevtools } from '../middleware/createDevtools';
import { GraphStoreState, initialState } from './initialState';
import { graphCanvas, GraphCanvasAction } from './slices/canvas/action';

//  ===============  聚合 createStoreFn ============ //
export interface GraphStoreAction
    extends GraphCanvasAction { }

export type GraphStore = GraphStoreAction & GraphStoreState;

const createStore: StateCreator<GraphStore, [['zustand/devtools', never]]> = (...parameters) => ({
    ...initialState,
    ...graphCanvas(...parameters),
});

//  ===============  实装 useStore ============ //
const devtools = createDevtools('flow');

export const useGraphStore = createWithEqualityFn<GraphStore>()(
    subscribeWithSelector(devtools(createStore, {
        name: 'lobe-graph-store',
    })), shallow);

export const getGraphStoreState = () => useGraphStore.getState();
