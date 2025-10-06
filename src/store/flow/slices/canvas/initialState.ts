import type { Node as NodeType, Edge as EdgeType } from '@xyflow/react'

export interface FlowCanvasState {
  /**
   * @title 当前活动的话题
   */
  activeTopicId: string;
  loadingTopic: boolean;

  /**
   * @title 图
   */
  edges: EdgeType[];
  nodes: NodeType[];
}

export const initialFlowCanvasState: FlowCanvasState = {
  activeTopicId: 'inbox',
  loadingTopic: false,
  nodes: [
    {
      id: '2',
      type: 'custom',
      data: {
        label: 'Topic 1',
        content: 'Query from Topic1？',
      },
      position: { x: 50, y: 50 }
    },
    {
      id: '3',
      type: 'custom',
      data: {
        label: 'Topic 2',
        content: 'Long anwser from topic 1',
      },
      position: { x: 100, y: 100 }
    }
  ],
  edges: [],
};

