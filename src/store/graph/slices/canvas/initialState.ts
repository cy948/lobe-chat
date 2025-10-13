import type { Edge as EdgeType, Node as NodeType } from '@xyflow/react';

export interface GraphCanvasState {
  /**
   * @title 图
   */
  edges: EdgeType[];
  nodes: NodeType[];
}

export const initialGraphCanvasState: GraphCanvasState = {
  edges: [],
  nodes: [],
};
