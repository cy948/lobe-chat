export const messageMapKey = (stateId: string, nodeId?: string | null) => {
    if (nodeId) return `${stateId}_${nodeId}`;
    return `${stateId}_${new Date().getTime()}`;
}