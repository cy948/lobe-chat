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
import { getChatStoreState } from '@/store/chat/store';
import { topicSelectors } from '@/store/chat/slices/topic/selectors';

export interface FlowCanvasAction {
    addNode: (node: NodeType) => void;
    delNode: (id: string) => void;
    setNodes: (nodes: NodeChange[]) => void;
    addEdge: (edge: EdgeType) => void;
    setEdges: (edges: EdgeChange[]) => void;

    loadTopic: () => Promise<void>;
    loadNodeMessages: (nodeId: string) => Promise<void>;
}

export const flowCanvas: StateCreator<
    FlowStore,
    [['zustand/devtools', never]],
    [],
    FlowCanvasAction
> = (set, get) => ({
    addNode: (node) => {
        const { nodes } = get();
        set({
            ...get(),
            nodes: [...nodes, node],
        });
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
        
    }
})