import { CanvasState } from "@/types/graph";
import { GraphStore } from "../../store";

const getActiveCanvasState = (s: GraphStore) : CanvasState | undefined => 
  s.activeStateId? s.stateMap[s.activeStateId] : undefined;

export const canvasSelectors = {
  getActiveCanvasState  
};
