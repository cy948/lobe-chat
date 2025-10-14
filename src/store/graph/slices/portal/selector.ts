import { GraphStore } from "../../store";

export const getActiveNodeMeta = (s: GraphStore) => 
    s.activeNodeId ? s.nodeMetaMap[s.activeNodeId] : undefined;

export const portalSelectors = {
    getActiveNodeMeta,
};
