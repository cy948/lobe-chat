import type { Edge, Node } from '@xyflow/react';
import { ChatMessage } from '../message';

export type CanvasState = {
    edges: Edge[]
    nodes: Node[]
}

export type GraphNodeMeta = {
    type: 'text' | 'chat';
    summary?: string;
    useSummary?: boolean;
    title?: string;
}

export type GraphNode = {
    id: string,
    meta: GraphNodeMeta,
    messages?: ChatMessage[],
}

export type GraphState = {
    id: string,
    state: CanvasState,
    nodes: GraphNode[],
}