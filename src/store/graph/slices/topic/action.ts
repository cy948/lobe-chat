import isEqual from 'fast-deep-equal';
import { SWRResponse } from 'swr';
import { StateCreator } from 'zustand/vanilla';

import { useClientDataSWR } from '@/libs/swr';
import { graphService } from '@/services/graph';
import { GraphStore } from '@/store/graph/store';
import { GraphTopic } from '@/types/graph';

export interface GraphTopicAction {
  createState: (title?: string) => Promise<void>;
  removeState: (stateId: string) => Promise<void>;
  switchState: (stateId?: string) => void;
  updateState: (stateId: string, data: Partial<GraphTopic>) => Promise<void>;
  useFetchGraphTopics: (isDBInited: boolean) => SWRResponse<GraphTopic[]>;
}

const SWR_USE_FETCH_GRAPH_TOPICS = 'useFetchGraphTopics';

export const graphTopic: StateCreator<
  GraphStore,
  [['zustand/devtools', never]],
  [],
  GraphTopicAction
> = (set, get) => ({
  createState: async () => {
    const newState = await graphService.createState();
    // Update store directly
    get().internal_updateCanvasState(newState.id, { edges: [], nodes: [] });
    // update topic list
    set({
      stateTopicList: [
        ...get().stateTopicList,
        { id: newState.id, title: 'New State' } as GraphTopic,
      ],
    });
    // switch to the new state
    get().switchState(newState.id);
  },
  removeState: async (stateId) => {
    await graphService.removeState(stateId);
  },
  switchState: (stateId) => {
    if (!stateId) return;
    set({ activeNodeId: undefined, activeStateId: stateId });
  },
  updateState: async (stateId, data) => {
    await graphService.updateState(stateId, data);
  },
  useFetchGraphTopics: (isDBInited) =>
    useClientDataSWR<GraphTopic[]>(
      isDBInited ? [SWR_USE_FETCH_GRAPH_TOPICS] : null,
      async ([,]: [string]) => graphService.fetchTopics(),
      {
        onSuccess(data) {
          const nextTopiList = data || [];
          if (isEqual(get().stateTopicList, nextTopiList)) return;
          set({
            stateTopicList: nextTopiList,
          });
        },
      },
    ),
});
