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

import { messageService } from '@/services/message';
import { topicService } from '@/services/topic';
import { FlowStore } from '@/store/flow/store';
import { SWRResponse } from 'swr';
import { useClientDataSWR } from '@/libs/swr';
import { flowService } from '@/services/flow';
import { FlowNodeMeta, FlowState } from '@/types/flow';

const SWR_USE_FETCH_NODE_METAS = 'flow-node-metas';



export interface FlowCanvasAction {
  addEdge: (edge: EdgeType) => void;

  addNode: (node: Partial<NodeType>) => Promise<void>;
  delNode: (id: string) => Promise<void>;
  // TODO: Should with type
  getNodeMeta: (nodeId: string) => FlowNodeMeta | undefined;
  loadTopic: () => Promise<void>;

  setActiveNode: (id: string) => void;
  setEdges: (edges: EdgeChange[]) => void;

  setNodeMeta: (nodeId: string, meta: Partial<FlowNodeMeta>) => void;
  setNodes: (nodes: NodeChange[]) => Promise<void>;

  useFetchCanvasState: (
    enable: boolean,
    topicId?: string,
  ) => SWRResponse<FlowState | undefined>;
}

export const flowCanvas: StateCreator<
  FlowStore,
  [['zustand/devtools', never]],
  [],
  FlowCanvasAction
> = (set, get) => ({
  addEdge: (edge) => {
    const { edges } = get();
    set({
      ...get(),
      edges: valAddEdge(edge, edges),
    });
  },
  addNode: async (node) => {
    const { nodes, activeTopicId, activeSessionId } = get();

    let topicId = activeTopicId;

    // Check if topic exists
    // If not, create a new topic
    if (!topicId) {
      console.log('No active topic, try to create one first...');
      // Create a new topic
      topicId = await topicService.createTopic({
        sessionId: activeSessionId,
        title: 'Flow Topic',
      });
      // Create a new flow session
      await flowService.createCanvasState(topicId);

      set({ activeTopicId: topicId });
    }

    console.log('Adding node to topic:', topicId);

    // Try create node
    // Create Node meta
    const newNodeMetaItem = await flowService.createNodeMeta(topicId, {
      summary: '',
      title: '',
      useSummary: false,
    })

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
    await flowService.updateCanvasState(topicId, { nodes: newNodes });
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
      const nodeMeta = get().getNodeMeta(id);
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
  setEdges: (changes) => {
    const { edges: currentEdges } = get();
    set({
      ...get(),
      edges: applyEdgeChanges(changes, currentEdges),
    });
  },
  setNodeMeta(nodeId, meta) {
    const { nodeMetaMap } = get();
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
  },

  setNodes: async (changes) => {
    const { activeTopicId, nodes: currentNodes } = get();
    if (!activeTopicId) {
      console.warn('No active topic, can not update nodes');
      return;
    }
    const newNodes = applyNodeChanges(changes, currentNodes);
    set({
      ...get(),
      nodes: newNodes,
    });
    await flowService.updateCanvasState(activeTopicId, { nodes: newNodes });
  },

  useFetchCanvasState: (enable, topicId) =>
    useClientDataSWR<FlowState | undefined>(
      enable ? [SWR_USE_FETCH_NODE_METAS, topicId] : null,
      async ([, topicId]: [string, string | undefined]) =>
        flowService.getCanvasState(topicId),
      {
        onSuccess: (flowState) => {
          console.log(flowState)
          // const nextMap: Record<string, FlowNodeMeta> = metas.reduce((acc, meta) => {
          //   acc[meta] = meta;
          //   return acc;
          // }, {} as Record<string, FlowNodeMeta>);

          // if (get().nodeMetaInit && isEqual(nextMap, get().nodeMetaMap)) return;

          // set({
          //   nodeMetaInit: true,
          //   nodeMetaMap: nextMap,
          // })
        }
      }
    )
});
