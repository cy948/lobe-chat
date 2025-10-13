import isEqual from 'fast-deep-equal';
import {
  type EdgeChange,
  type Edge as EdgeType,
  type NodeChange,
  type Node as NodeType,
  applyEdgeChanges,
  applyNodeChanges,
  addEdge as valAddEdge,
} from '@xyflow/react';
import { StateCreator } from 'zustand/vanilla';
import { GraphStore } from '@/store/graph';
import { GraphState, CanvasState, GraphNodeMeta } from '@/types/graph';
import { SWRResponse } from 'swr';
import { useClientDataSWR } from '@/libs/swr';
import { graphService } from '@/services/graph';
import { messageMapKey } from '@/store/graph/utils';

const SWR_USE_FETCH_GRAPH_CANVAS = 'graph-canvas-state';

export interface GraphCanvasAction {

  addEdge: (edge: EdgeType) => Promise<void>;
  addNode: (node: Partial<NodeType>, meta: Partial<GraphNodeMeta>) => Promise<void>;

  setEdges: (edges: EdgeChange[]) => Promise<void>;
  setNodes: (nodes: NodeChange[]) => Promise<void>;

  useFetchCanvasState: (
    isDBInited: boolean,
    stateId?: string | null,
  ) => SWRResponse<GraphState | undefined>;


  // db 方法
  updateCanvasState: (stateId: string, state: Partial<CanvasState>) => Promise<void>;

  /**
   * 内部方法：更新画布状态
   */

  /**
   * @description 触发 UI 更新
   * @param stateId 
   * @param state 
   * @returns 
   */
  internal_updateCanvasState: (stateId: string, state: Partial<CanvasState>) => void;
}

export const graphCanvas: StateCreator<
  GraphStore,
  [['zustand/devtools', never]],
  [],
  GraphCanvasAction
> = (set, get) => ({
  addEdge: async (edge) => {
    const { activeStateId, stateMap } = get();
    if (!activeStateId) return;
    const currentState = stateMap[activeStateId];
    if (!currentState) return;
    const nextEdges = valAddEdge(edge, currentState.edges);
    // Trigger UI update
    get().internal_updateCanvasState(activeStateId, { edges: nextEdges });
    // Trigger DB update
    await get().updateCanvasState(activeStateId, { edges: nextEdges });
  },

  addNode: async (node, meta) => {
    const { activeStateId } = get();
    if (!activeStateId) return;
    const currentState = get().stateMap[activeStateId];
    if (!currentState) return;
  
    const newNodeMeta = await graphService.createNode(activeStateId, meta);

    const newNode: NodeType = {
      id: newNodeMeta.id,
      data: node.data || {},
      position: node.position || { x: 0, y: 0 },
      type: node.type || 'chat',
    }

    // Trigger UI update
    get().internal_updateCanvasState(activeStateId, { nodes: [...currentState.nodes, newNode] });
    // Trigger DB update
    await get().updateCanvasState(activeStateId, { nodes: [...currentState.nodes, newNode] });
  },

  setEdges: async (edges) => {
    const { activeStateId, stateMap } = get();
    if (!activeStateId) return;
    const currentState = stateMap[activeStateId];
    if (!currentState) return;
    const nextEdges = applyEdgeChanges(edges, currentState.edges);
    // Trigger UI update
    get().internal_updateCanvasState(activeStateId, { edges: nextEdges });
    // Trigger DB update
    await get().updateCanvasState(activeStateId, { edges: nextEdges });
  },

  setNodes: async (nodes) => {
    const { activeStateId, stateMap } = get();
    if (!activeStateId) return;
    const currentState = stateMap[activeStateId];
    if (!currentState) return;
    const nextNodes = applyNodeChanges(nodes, currentState.nodes);
    // Trigger UI update
    get().internal_updateCanvasState(activeStateId, { nodes: nextNodes });
    // Trigger DB update
    await get().updateCanvasState(activeStateId, { nodes: nextNodes });
  },

  updateCanvasState: async (stateId, state) => {
    try {
      await graphService.updateState(stateId, state);
    } catch (e) {
      console.error('Failed to update graph state', e);
    }
  },

  internal_updateCanvasState(stateId, state) {
    const { stateMap } = get()
    const currentState = stateMap[stateId]
    if (!currentState) return
    const nextStateMap = {
      ...stateMap,
      [stateId]: {
        ...currentState,
        ...state,
      },
    };
    if (isEqual(nextStateMap, stateMap)) return
    set({ stateMap: nextStateMap });
  },

  useFetchCanvasState: (isDBInited, stateId) =>
    useClientDataSWR<GraphState | undefined>(
      isDBInited? [SWR_USE_FETCH_GRAPH_CANVAS, stateId] : null,
      async ([, stateId]: [string, string | undefined]) => graphService.fetchState(stateId),
      {
        onSuccess: (state) => {
          console.log('Fetched graph canvas state', stateId, state);
          if (!state) return
          // decide whether to set canvas state
          const nextStateMap = {
            ...get().stateMap,
            [state.id]: state.state,
          }
          if (!get().isStateInit || !isEqual(nextStateMap, get().stateMap)) {
            // If not inited, or state changed, then set it
            set({
              isStateInit: true,
              activeStateId: state.id,
              stateMap: nextStateMap,
            });
          }
          const nextMessageMap = state.nodes.reduce((mp, node) => {
            if (node.messages)
              mp[messageMapKey(state.id, node.id)] = node.messages;
            return mp;
          }, { ...get().messagesMap });
          if (!isEqual(nextMessageMap, get().messagesMap)) {
            set({
              // TODO: should we add message init ?
              messagesMap: nextMessageMap,
            });
          }
        }
      })
});

