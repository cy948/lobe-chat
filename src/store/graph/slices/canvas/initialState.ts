import { CanvasState } from '@/types/graph';

export interface GraphCanvasState {
  activeStateId?: string;
  stateMap: Record<string, CanvasState>;
  isStateInit: boolean;
  /**
   * @title 图
   */
}

export const initialGraphCanvasState: GraphCanvasState = {
  isStateInit: false,
  stateMap: {},
};
