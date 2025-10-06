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

export interface FlowCanvasAction {
    addNode: (node: NodeType) => void;
    delNode: (id: string) => void;
    setNodes: (nodes: NodeChange[]) => void;
    addEdge: (edge: EdgeType) => void;
    setEdges: (edges: EdgeChange[]) => void;
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
    }
})