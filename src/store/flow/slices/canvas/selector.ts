import type { FlowStore } from '@/store/flow'

const getNodeMessageIds = (nodeId: string) => 
    (s: FlowStore) => s.getNodeMeta(nodeId)?.messages.map((m) => m.id) || [];

const getActiveNodeMessages = (s: FlowStore) => {
    const nodeId = s.activeNodeId;
    if (!nodeId) return [];
    return s.getNodeMeta(nodeId)?.messages || [];
};

const getActiveNodeMeta = (s: FlowStore) => {
    const nodeId = s.activeNodeId;
    if (!nodeId) return undefined;
    return s.getNodeMeta(nodeId);
}

const getActiveNodeMessageIds = (s: FlowStore) => {
    return getActiveNodeMessages(s).map((m) => m.id);
}

const getMessageById = (id: string) => (s: FlowStore) => 
    getActiveNodeMessages(s).find((m) => m.id === id);

const currentChatLoadingState = (s: FlowStore) => !s.messagesInit;

const setActiveNodeUseSummary = (s: FlowStore) => (use: boolean) => {
    const nodeId = s.activeNodeId;
    if (!nodeId) return;
    s.setNodeMeta(nodeId, { useSummary: use });
}

export const canvasSelectors = {
    getNodeMessageIds,
    getActiveNodeMessages,
    getActiveNodeMessageIds,
    getMessageById,
    currentChatLoadingState,
    getActiveNodeMeta,
    setActiveNodeUseSummary,
}