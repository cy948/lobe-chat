import { StateCreator } from 'zustand/vanilla';
import { GraphStore } from '@/store/graph';
import { GraphState } from '@/types/graph';
import { SWRResponse } from 'swr';
import { useClientDataSWR } from '@/libs/swr';
import { graphService } from '@/services/graph';

const SWR_USE_FETCH_GRAPH_CANVAS = 'graph-canvas-state';

export interface GraphCanvasAction {
  useFetchCanvasState: (
    isDBInited: boolean,
    stateId?: string | null,
  ) => SWRResponse<GraphState | undefined>;
}

export const graphCanvas: StateCreator<
  GraphStore,
  [['zustand/devtools', never]],
  [],
  GraphCanvasAction
> = (set, get) => ({
  useFetchCanvasState: (isDBInited, stateId) =>
    useClientDataSWR<GraphState | undefined>(
      isDBInited && stateId ? [SWR_USE_FETCH_GRAPH_CANVAS, stateId] : null,
      async ([, stateId]: [string, string]) => graphService.fetchState(stateId),
      {
        onSuccess: (state) => {

        }
      })
});

