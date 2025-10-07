import type { FlowStore } from '@/store/flow'

const getNodeMessageIds = (nodeId: string) => 
    (s: FlowStore) => s.getNodeMeta(nodeId)?.messages.map((m) => m.id) || [];

const getActiveNodeMessageIds = (s: FlowStore) => {
    const nodeId = s.activeNodeId;
    if (!nodeId) return [];
    return s.getNodeMeta(nodeId)?.messages.map((m) => m.id) || [];
}

export const canvasSelectors = {
    getNodeMessageIds,
    getActiveNodeMessageIds,
}