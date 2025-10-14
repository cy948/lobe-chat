import {
  type EdgeChange,
  type Edge as EdgeType,
  type NodeChange,
  type Node as NodeType,
  applyEdgeChanges,
  applyNodeChanges,
  addEdge as valAddEdge,
} from '@xyflow/react';
import { debounce } from 'lodash-es';
import { SWRResponse } from 'swr';
import { StateCreator } from 'zustand/vanilla';

import { useClientDataSWR } from '@/libs/swr';
import { flowService } from '@/services/flow';
import { topicService } from '@/services/topic';
import { FlowStore } from '@/store/flow/store';
import { FlowNodeMeta, FlowState } from '@/types/flow';

const SWR_USE_FETCH_NODE_METAS = 'flow-node-metas';

interface ChildNode {
  distance: number;
  id: string;
  meta: FlowNodeMeta;
}

export interface FlowCanvasAction {
  addEdge: (edge: EdgeType) => Promise<void>;

  addNode: (node: Partial<NodeType>) => Promise<void>;
  delNode: (id: string) => Promise<void>;
  // TODO: Should with type
  getNodeMeta: (nodeId: string) => FlowNodeMeta | undefined;
  internal_searchChildNodes: (nodeId: string) => { children: ChildNode[]; edges: EdgeType[] };

  loadTopic: () => Promise<void>;
  setActiveNode: (id: string) => void;

  setEdges: (edges: EdgeChange[]) => Promise<void>;
  setNodeMeta: (nodeId: string, meta: Partial<FlowNodeMeta>) => Promise<void>;

  setNodes: (nodes: NodeChange[]) => Promise<void>;

  useFetchCanvasState: (enable: boolean, stateId?: string) => SWRResponse<FlowState | undefined>;
}

export const flowCanvas: StateCreator<
  FlowStore,
  [['zustand/devtools', never]],
  [],
  FlowCanvasAction
> = (set, get) => ({
  addEdge: async (edge) => {
    const { activeStateId, edges } = get();
    if (!activeStateId) {
      console.warn('No active state, can not add edge');
      return;
    }

    const newEdges = valAddEdge(edge, edges);

    set({
      ...get(),
      edges: newEdges,
    });

    await flowService.updateCanvasState(activeStateId, { edges: newEdges });
  },
  addNode: async (node) => {
    const { nodes, activeTopicId, activeSessionId, activeStateId } = get();

    let topicId = activeTopicId;
    let stateId = activeStateId;

    // Check if topic exists
    // If not, create a new topic
    if (!topicId || !stateId) {
      console.log('No active topic or state, try to create one first...');
      // Create a new topic
      topicId = await topicService.createTopic({
        sessionId: activeSessionId,
        title: 'Flow Topic',
      });
      // Create a new flow session
      stateId = await flowService.createCanvasState(topicId);

      set({ activeStateId: stateId, activeTopicId: topicId });
    }

    console.log('Adding node to topic:', topicId);

    // Try create node
    // Create Node meta
    const newNodeMetaItem = await flowService.createNodeMeta(stateId, {
      summary: '',
      title: '',
      useSummary: false,
    });

    const newNode: NodeType = {
      data: node.data || { description: '', label: '聊聊你的想法' },
      id: newNodeMetaItem.id,
      position: node.position || { x: 0, y: 0 },
      type: node.type || 'custom',
    };

    const newNodes = [...nodes, newNode];
    set({
      ...get(),
      nodes: newNodes,
    });

    get().setNodeMeta(newNode.id, newNodeMetaItem.metadata as FlowNodeMeta);

    // Update canvas state in backend
    await flowService.updateCanvasState(stateId, { nodes: newNodes });
  },
  delNode: async (id) => {
    const { nodes, edges } = get();
    console.log('del node', id);

    set({
      ...get(),
      edges: edges.filter((e) => e.source !== id && e.target !== id),
      nodes: nodes.filter((n) => n.id !== id),
    });

    try {
      // Clean messages (should use db cascade delete?
      // const nodeMeta = get().getNodeMeta(id);
      // Try delete node meta
      await flowService.removeNodeMeta(id);
    } catch (error) {
      console.error('Failed to delete messages for node', id, error);
    }

    // Clean node meta
    delete get().nodeMetaMap[id];

    if (get().activeNodeId === id) {
      set({
        activeNodeId: undefined,
        detailBoxVisible: false,
      });
    }
  },
  getNodeMeta(nodeId) {
    return get().nodeMetaMap[nodeId];
  },
  internal_searchChildNodes(nodeId) {
    // TODO: check implementation
    const { edges, getNodeMeta } = get();

    const parentMap: Map<string, string[]> = edges.reduce((map, edge) => {
      if (!map.has(edge.target)) map.set(edge.target, []);
      map.get(edge.target)!.push(edge.source);
      return map;
    }, new Map<string, string[]>());

    let activedEdges: EdgeType[] = [];
    // BFS to calculate distance from nodeId to all ancestor nodes
    const distances = new Map<string, number>();
    const queue: Array<{ distance: number; nodeId: string }> = [{ distance: 0, nodeId: nodeId }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { nodeId, distance } = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      distances.set(nodeId, distance);

      // Add parent nodes to queue with incremented distance
      const parents = parentMap.get(nodeId) || [];
      for (const parentId of parents) {
        if (!visited.has(parentId)) {
          queue.push({ distance: distance + 1, nodeId: parentId });
          activedEdges.push({
            id: `${parentId}-${nodeId}`,
            source: parentId,
            target: nodeId,
          });
        }
      }
    }

    // Build ChildNode array from distances (excluding the original nodeId if desired)
    const result: ChildNode[] = [];
    for (const [id, distance] of distances.entries()) {
      if (id === nodeId) continue; // skip the root node itself if needed
      const meta = getNodeMeta(id);
      if (meta) {
        result.push({ distance, id, meta });
      }
    }

    return {
      children: result,
      edges: activedEdges,
    };
  },
  loadTopic: async () => {
    // Try
    // const chatState = getChatStoreState();
    // const topic = topicSelectors.getTopicById(get().activeTopicId)(chatState);
    // if (get().activeTopicId === 'inbox' || !topic) {
    //     // Try create canvas topic
    //     if (get().loadingTopic) {
    //         console.log('Topic is loading, please wait...');
    //         return;
    //     }
    //     console.log('Topic not found, creating a new one...');
    //     set({ loadingTopic: true });
    //     try {
    //         // Try create topic
    //         console.warn('Topic not found:', get().activeTopicId, 'Creating a new topic...');
    //         const newTopicId = await chatState.createTopic()
    //         console.log('Created new topic:', newTopicId);
    //         set({ activeTopicId: newTopicId });
    //         await chatState.refreshTopic()
    //     } catch (error) {
    //         console.error('Failed to create topic:', error);
    //     }
    //     set({ loadingTopic: false });
    // }
  },
  setActiveNode(id) {
    set({ ...get(), activeNodeId: id });
  },
  setEdges: async (changes) => {
    const { activeStateId, edges: currentEdges } = get();
    if (!activeStateId) {
      console.warn('No active state, can not update edges');
      return;
    }
    set({
      ...get(),
      edges: applyEdgeChanges(changes, currentEdges),
    });

    await flowService.updateCanvasState(activeStateId, { edges: get().edges });
  },

  setNodeMeta: async (nodeId, meta) => {
    const { nodeMetaMap, activeStateId } = get();
    if (!activeStateId) {
      console.warn('No active state, can not update node meta');
      return;
    }
    set({
      ...get(),
      nodeMetaMap: {
        ...nodeMetaMap,
        [nodeId]: {
          ...nodeMetaMap[nodeId],
          ...meta,
        },
      },
    });

    debounce(async () => {
      await flowService.updateNodeMeta(nodeId, meta);
    }, 1000)();
  },

  setNodes: async (changes) => {
    const { activeStateId, nodes: currentNodes } = get();
    if (!activeStateId) {
      console.warn('No active state, can not update nodes');
      return;
    }
    const newNodes = applyNodeChanges(changes, currentNodes);
    set({
      ...get(),
      nodes: newNodes,
    });
    debounce(async () => {
      await flowService.updateCanvasState(activeStateId, { nodes: newNodes });
    }, 1000)();
  },

  useFetchCanvasState: (enable, stateId) =>
    useClientDataSWR<FlowState | undefined>(
      enable ? [SWR_USE_FETCH_NODE_METAS, stateId] : null,
      async ([, stateId]: [string, string | undefined]) => flowService.getCanvasState(stateId),
      {
        onSuccess: (flowState) => {
          console.log(flowState);

          // const nextMap: Record<string, FlowNodeMeta> = metas.reduce((acc, meta) => {
          //   acc[meta] = meta;
          //   return acc;
          // }, {} as Record<string, FlowNodeMeta>);

          // if (get().nodeMetaInit && isEqual(nextMap, get().nodeMetaMap)) return;

          // set({
          //   nodeMetaInit: true,
          //   nodeMetaMap: nextMap,
          // })
        },
      },
    ),
});

/**
 * TODO(flow):
 * - Should refactor the messages store in RDB
 *   - fetch messages and canvas conf at init
 *   - only update message if message update
 *   - if messages being change or rm, update node meta
 */
