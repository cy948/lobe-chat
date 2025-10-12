import { type Edge as EdgeType, type Node as NodeType } from '@xyflow/react';

import { ChatMessage } from "../message";

export interface FlowNodeMeta {
    messages: ChatMessage[];
    messageIds: string[];
    summary: string;
    title: string;
    useSummary: boolean;
    id?: string;
    isLatestSummary?: boolean;
}

export interface FlowState {
    edges: EdgeType[];
    nodes: NodeType[];
    nodeMetas?: FlowNodeMeta[];
}