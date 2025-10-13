import { ChatMessage } from '@/types/message';
import type { Edge as EdgeType, Node as NodeType } from '@xyflow/react';

export interface GraphMessageState {
    messagesMap: Record<string, ChatMessage[]>;
}

export const initialGraphMessageState: GraphMessageState = {
    messagesMap: {},
};
