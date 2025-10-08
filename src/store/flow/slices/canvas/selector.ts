import type { FlowStore } from '@/store/flow'

const getNodeMessageIds = (nodeId: string) => 
    (s: FlowStore) => s.getNodeMeta(nodeId)?.messages.map((m) => m.id) || [];

const getActiveNodeMessages = (s: FlowStore) => {
    const nodeId = s.activeNodeId;
    if (!nodeId) return [];
    return s.getNodeMeta(nodeId)?.messages || [];
};

const getActiveNodeMessageIds = (s: FlowStore) => {
    return getActiveNodeMessages(s).map((m) => m.id);
}

const getMessageById = (id: string) => (s: FlowStore) => 
    getActiveNodeMessages(s).find((m) => m.id === id);


const currentChatLoadingState = (s: FlowStore) => !s.messagesInit;

export const canvasSelectors = {
    getNodeMessageIds,
    getActiveNodeMessages,
    getActiveNodeMessageIds,
    getMessageById,
    currentChatLoadingState,
}