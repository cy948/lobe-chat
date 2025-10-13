import type { Edge, Node } from '@xyflow/react';

export type CanvasState = {
    edges: Edge[]
    nodes: Node[]
}

export type GraphNode = {
    type: 'text' | 'chat';
}

export type GraphState = {
    props: CanvasState,
    nodes: GraphNode[],
}