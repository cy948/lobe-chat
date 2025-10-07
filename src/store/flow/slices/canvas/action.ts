import { StateCreator } from 'zustand/vanilla';
import {
    type Node as NodeType,
    type Edge as EdgeType,
    type NodeChange,
    type EdgeChange,
    addEdge as valAddEdge,
    applyNodeChanges,
    applyEdgeChanges,
} from '@xyflow/react'
import { FlowStore } from '@/store/flow/store';
import { ChatMessage } from '@/types/message';
import { topicService } from '@/services/topic';

export interface FlowNodeMeta {
  messageGroupId?: string;
  messageGroup?: any;
  messages: ChatMessage[];
}
export interface FlowCanvasAction {
    setActiveNode: (id: string) => void;

    addNode: (node: Partial<NodeType>) => Promise<void>;
    delNode: (id: string) => void;
    setNodes: (nodes: NodeChange[]) => void;
    addEdge: (edge: EdgeType) => void;
    setEdges: (edges: EdgeChange[]) => void;

    loadTopic: () => Promise<void>;
    loadNodeMessages: (nodeId: string) => Promise<void>;

    // TODO: Should with type
    getNodeMeta: (nodeId: string) => FlowNodeMeta;
    setNodeMeta: (nodeId: string, meta: FlowNodeMeta) => void;
}

const generateId = () => `${Date.now()}`;

export const flowCanvas: StateCreator<
    FlowStore,
    [['zustand/devtools', never]],
    [],
    FlowCanvasAction
> = (set, get) => ({
    setActiveNode(id) {
        set({ ...get(), activeNodeId: id });
    },
    addNode: async (node) => {
        const { nodes, activeTopicId, activeSessionId } = get();
        const newNode: NodeType = {
            id: node.id || generateId(),
            position: node.position || { x: 0, y: 0 },
            data: node.data || { label: '聊聊你的想法', description: '' },
            type: node.type || 'custom',
        }
        set({
            ...get(),
            nodes: [...nodes, newNode],
        });

        // Check if topic exists
        // If not, create a new topic
        if (!activeTopicId){
            console.log('No active topic, try to create one first...');
            // Create a new topic
            const topicId = await topicService.createTopic({
                title: 'Flow Topic',
                sessionId: activeSessionId,
            });
            set({ activeTopicId: topicId });
        }

    },
    delNode: (id) => {
        const { nodes, edges } = get();
        console.log('del node', id);
        set({
            ...get(),
            nodes: nodes.filter((n) => n.id !== id),
            edges: edges.filter((e) => e.source !== id && e.target !== id),
        });
    },
    setNodes: (changes) => {
        const { nodes: currentNodes } = get();
        set({
            ...get(),
            nodes: applyNodeChanges(changes, currentNodes),
        });
    },
    addEdge: (edge) => {
        const { edges } = get();
        set({
            ...get(),
            edges: valAddEdge(edge, edges),
        });
    },
    setEdges: (changes) => {
        const { edges: currentEdges } = get();
        set({
            ...get(),
            edges: applyEdgeChanges(changes, currentEdges),
        });
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
    loadNodeMessages: async (nodeId) => {
        // fetchFromRemote
        
    },
    getNodeMeta(nodeId) {
        if (!nodeId) {
            // Create new meta
            const newMeta: FlowNodeMeta = {
                messageGroupId: undefined,
                messageGroup: undefined,
                messages: [],
            }
            get().setNodeMeta(nodeId, newMeta);
            return newMeta;
        }
        return get().nodeMetaMap[nodeId];
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
                }
            }
        });
    },
})