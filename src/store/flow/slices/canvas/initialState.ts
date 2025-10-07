import type { Node as NodeType, Edge as EdgeType } from '@xyflow/react'
import type { FlowNodeMeta } from './action'

export interface FlowCanvasState {
  /**
   * @title 图
   */
  edges: EdgeType[];
  nodes: NodeType[];

  /**
   * @description NodeId 与 messageGroup 映射
   */
  nodeMetaMap: Record<string, FlowNodeMeta>;


  /**
   * ==============
   * 非持久化 state
   * ==============
   */

  /**
   * @title 当前活动的话题
   */
  activeTopicId?: string;
  loadingTopic: boolean;

  activeNodeId?: string;
  activeSessionId: string;

  showNodeDetailDrawer: boolean;
  nodeDetail?: FlowNodeMeta;
}

export const initialFlowCanvasState: FlowCanvasState = {
  activeSessionId: 'inbox',
  loadingTopic: false,
  showNodeDetailDrawer: false,
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
  nodeMetaMap: {},
  nodeDetail: undefined,
};

