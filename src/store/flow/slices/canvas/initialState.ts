import type { Edge as EdgeType, Node as NodeType } from '@xyflow/react';

import type { FlowNodeMeta } from './action';

export interface FlowCanvasState {
  activeSessionId: string;
  /**
   * ==============
   * 非持久化 state
   * ==============
   */
  /**
   * @title 当前活动的话题
   */
  activeTopicId?: string;

  /**
   * @title 图
   */
  edges: EdgeType[];

  loadingTopic: boolean;
  nodeDetail?: FlowNodeMeta;

  /**
   * @description NodeId 与 messageGroup 映射
   */
  nodeMetaMap: Record<string, FlowNodeMeta>;

  nodes: NodeType[];
}

export const initialFlowCanvasState: FlowCanvasState = {
  activeSessionId: 'inbox',
  edges: [],
  loadingTopic: false,
  nodeDetail: undefined,
  nodeMetaMap: {},
  nodes: [],
};
