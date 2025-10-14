import {
  type EdgeChange,
  type Edge as EdgeType,
  type NodeChange,
  type Node as NodeType,
  applyEdgeChanges,
  applyNodeChanges,
  addEdge as valAddEdge,
} from '@xyflow/react';
import isEqual from 'fast-deep-equal';
import { debounce } from 'lodash-es';
import { SWRResponse } from 'swr';
import { StateCreator } from 'zustand/vanilla';

import { useClientDataSWR } from '@/libs/swr';
import { graphService } from '@/services/graph';
import { GraphStore } from '@/store/graph/store';
import { messageMapKey, nodeMapKey } from '@/store/graph/utils';
import { CanvasState, GraphNode, GraphNodeMeta, GraphState } from '@/types/graph';

export const SWR_USE_FETCH_GRAPH_CANVAS = 'graph-canvas-state';
export const SWR_USE_FETCH_GRAPH_NODES = 'graph-node-metas';

export interface GraphCanvasAction {
  addEdge: (edge: EdgeType) => Promise<void>;
  addNode: (node: Partial<NodeType>, meta: Partial<GraphNodeMeta>) => Promise<void>;
  // 取消待执行的更新
  cancelPendingUpdates: (stateId?: string) => void;
  debouncedUpdateCanvasState: (stateId: string, state: Partial<CanvasState>) => void;

  delNode: (id: string) => Promise<void>;
  // 立即执行待更新
  flushPendingUpdates: (stateId?: string) => void;

  // 节流 db
  getDebouncedUpdate: (stateId: string) => ReturnType<typeof debounce>;

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

  internal_updateNodeMeta: (nodeId: string, meta: Partial<GraphNodeMeta>) => void;
  onDelNodes: (ids: string[]) => Promise<void>;

  setEdges: (edges: EdgeChange[]) => Promise<void>;
  setNodes: (nodes: NodeChange[]) => Promise<void>;
  /**
   *
   *  db 方法
   */
  updateCanvasState: (stateId: string, state: Partial<CanvasState>) => Promise<void>;
  updateNodeMeta: (nodeId: string, meta: Partial<GraphNodeMeta>) => Promise<void>;

  useFetchCanvasState: (
    isDBInited: boolean,
    stateId?: string | null,
  ) => SWRResponse<GraphState | undefined>;
  useFetchNodeMeta: (
    isDBInited: boolean,
    stateId?: string | null,
  ) => SWRResponse<GraphNode[] | undefined>;
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
      data: node.data || {},
      id: newNodeMeta.id,
      position: node.position || { x: 0, y: 0 },
      type: node.type || 'chat',
    };

    // Trigger UI update
    get().internal_updateCanvasState(activeStateId, { nodes: [...currentState.nodes, newNode] });
    // TODO: should optimize DB update
    await get().updateCanvasState(activeStateId, { nodes: [...currentState.nodes, newNode] });
  },

  cancelPendingUpdates: (stateId) => {
    if (stateId) {
      get().debouncedUpdateMap.get(stateId)?.cancel();
      get().pendingUpdates.delete(stateId);
    } else {
      get().debouncedUpdateMap.forEach((fn) => fn.cancel());
      get().pendingUpdates.clear();
    }
  },

  // 防抖更新（会合并多次调用）
  debouncedUpdateCanvasState: (stateId, state) => {
    // 合并状态更新
    const currentPending = get().pendingUpdates.get(stateId) || {};
    const mergedState = {
      ...currentPending,
      ...state,

      edges: state.edges ?? currentPending.edges,
      // 特殊处理 nodes 和 edges，使用最新值
      nodes: state.nodes ?? currentPending.nodes,
    };
    get().pendingUpdates.set(stateId, mergedState);

    // 触发防抖更新
    const debouncedFn = get().getDebouncedUpdate(stateId);
    debouncedFn();
  },

  delNode: async (nodeId) => {
    const { activeStateId, stateMap } = get();
    if (!activeStateId) return;
    const currentState = stateMap[activeStateId];
    if (!currentState) return;
    const newState = {
      edges: currentState.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      nodes: currentState.nodes.filter((n) => n.id !== nodeId),
    };
    get().internal_updateCanvasState(activeStateId, newState);
    await get().updateCanvasState(activeStateId, newState);
    // TODO: Soft delete in db schema
  },

  flushPendingUpdates: (stateId) => {
    if (stateId) {
      get().debouncedUpdateMap.get(stateId)?.flush();
    } else {
      get().debouncedUpdateMap.forEach((fn) => fn.flush());
    }
  },

  getDebouncedUpdate: (stateId: string) => {
    if (!get().debouncedUpdateMap.has(stateId)) {
      const debouncedFn = debounce(
        async (state: Partial<CanvasState>) => {
          try {
            await graphService.updateState(stateId, state);
            console.log('Debounced update completed for', stateId);
          } catch (e) {
            console.error('Failed to update graph state', e);
          }
        },
        500, // 防抖延迟时间
        {
          maxWait: 2000, // 最大等待时间，防止长时间不更新
        },
      );
      get().debouncedUpdateMap.set(stateId, debouncedFn);
    }
    return get().debouncedUpdateMap.get(stateId)!;
  },

  internal_updateCanvasState(stateId, state) {
    const { stateMap } = get();
    const currentState = stateMap[stateId];
    if (!currentState) return;
    const nextStateMap = {
      ...stateMap,
      [stateId]: {
        ...currentState,
        ...state,
      },
    };
    if (isEqual(nextStateMap, stateMap)) return;
    set({ stateMap: nextStateMap });
  },

  internal_updateNodeMeta(nodeId, meta) {
    const { nodeMetaMap } = get();
    const currentMeta = nodeMetaMap[nodeId];
    if (!currentMeta) return;
    const nextNodeMetaMap = {
      ...nodeMetaMap,
      [nodeId]: {
        ...currentMeta,
        ...meta,
      },
    };
    if (isEqual(nextNodeMetaMap, nodeMetaMap)) return;
    set({ nodeMetaMap: nextNodeMetaMap });
  },

  onDelNodes: async (ids) => {
    // TODO: Soft delete in db schema
    // Notice: this hooks should not update nodes cause it already
    // updated by setNodes
    console.log('del nodes', ids);
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
    // console.log('set nodes', nodes);
    const { activeStateId, stateMap } = get();
    if (!activeStateId) return;
    const currentState = stateMap[activeStateId];
    if (!currentState) return;
    const nextNodes = applyNodeChanges(nodes, currentState.nodes);
    // Trigger UI update
    get().internal_updateCanvasState(activeStateId, { nodes: nextNodes });

    // Should use debounced update to reduce db writes
    get().debouncedUpdateCanvasState(activeStateId, { nodes: nextNodes });
  },

  updateCanvasState: async (stateId, state) => {
    try {
      await graphService.updateState(stateId, state);
    } catch (e) {
      console.error('Failed to update graph state', e);
    }
  },

  updateNodeMeta: async (nodeId, meta) => {
    try {
      await graphService.updateNode(nodeId, meta);
      // Trigger UI update
      get().internal_updateNodeMeta(nodeId, meta);
    } catch (e) {
      console.error('Failed to update graph node meta', e);
    }
  },

  useFetchCanvasState: (isDBInited, stateId) =>
    useClientDataSWR<GraphState | undefined>(
      isDBInited ? [SWR_USE_FETCH_GRAPH_CANVAS, stateId] : null,
      async ([, stateId]: [string, string | undefined]) => graphService.fetchState(stateId),
      {
        onSuccess: (state) => {
          console.log('Fetched graph canvas state', stateId, state);
          if (!state) return;
          // decide whether to set canvas state
          const nextStateMap = {
            ...get().stateMap,
            [state.id]: state.state,
          };
          if (!get().isStateInit || !isEqual(nextStateMap, get().stateMap)) {
            // If not inited, or state changed, then set it
            set({
              activeStateId: state.id,
              isStateInit: true,
              stateMap: nextStateMap,
            });
          }

          const nextMessageMap = state.nodes.reduce(
            (mp, node) => {
              if (node.messages) mp[messageMapKey(state.id, node.id)] = node.messages;
              return mp;
            },
            { ...get().messagesMap },
          );
          if (!get().messageInit || !isEqual(nextMessageMap, get().messagesMap)) {
            set({
              messageInit: true,
              // TODO: should we add message init ?
              messagesMap: nextMessageMap,
            });
          }

          const nextNodeMetaMap = state.nodes.reduce(
            (mp, node) => {
              mp[nodeMapKey(state.id, node.id)] = node.meta;
              return mp;
            },
            { ...get().nodeMetaMap },
          );
          if (!isEqual(nextNodeMetaMap, get().nodeMetaMap)) {
            set({
              nodeMetaMap: nextNodeMetaMap,
            });
          }
        },
      },
    ),

  useFetchNodeMeta: (isDBInited, stateId) =>
    useClientDataSWR<GraphNode[] | undefined>(
      isDBInited && !!stateId ? [SWR_USE_FETCH_GRAPH_NODES, stateId] : null,
      async ([, stateId]: [string, string]) => graphService.fetchNodes(stateId),
      {
        onSuccess: (nodes) => {
          if (!nodes || !stateId) return;
          const nextMessageMap = nodes.reduce(
            (mp, node) => {
              if (node.messages) mp[messageMapKey(stateId, node.id)] = node.messages;
              return mp;
            },
            { ...get().messagesMap },
          );
          if (!get().messageInit || !isEqual(nextMessageMap, get().messagesMap)) {
            set({
              messageInit: true,
              // TODO: should we add message init ?
              messagesMap: nextMessageMap,
            });
          }

          const nextNodeMetaMap = nodes.reduce(
            (mp, node) => {
              mp[nodeMapKey(stateId, node.id)] = node.meta;
              return mp;
            },
            { ...get().nodeMetaMap },
          );
          if (!isEqual(nextNodeMetaMap, get().nodeMetaMap)) {
            set({
              nodeMetaMap: nextNodeMetaMap,
            });
          }
        },
      },
    ),
});
