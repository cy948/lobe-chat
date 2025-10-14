import { ChatMessage } from '@/types/message';
import type { Edge as EdgeType, Node as NodeType } from '@xyflow/react';

export interface GraphMessageState {
    messageInit: boolean;
    messagesMap: Record<string, ChatMessage[]>;
    messageLoadingIds: string[];
    /**
 * is the message is editing
 */
    messageEditingIds: string[];
}

export const initialGraphMessageState: GraphMessageState = {
    messageInit: false,
    messagesMap: {},
    messageLoadingIds: [],
    messageEditingIds: [],
};
