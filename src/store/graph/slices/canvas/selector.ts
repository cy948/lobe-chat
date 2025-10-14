import { CanvasState, GraphNodeMeta } from "@/types/graph";
import { GraphStore } from "../../store";
import { nodeMapKey } from "../../utils";

const getNodeMeta = (s: GraphStore) => (stateId: string, nodeId: string) : GraphNodeMeta | undefined => {
  return s.nodeMetaMap[nodeMapKey(stateId, nodeId)];
}

const getActiveCanvasState = (s: GraphStore) : CanvasState | undefined => 
  s.activeStateId? s.stateMap[s.activeStateId] : undefined;

const getActiveCanvasNodeMeta = (s: GraphStore) => (nodeId: string) : GraphNodeMeta | undefined => {
  if (!s.activeStateId) return undefined;
  return getNodeMeta(s)(s.activeStateId, nodeId);
}

export const canvasSelectors = {
  getActiveCanvasState,
  getActiveCanvasNodeMeta,
  getNodeMeta,
};
