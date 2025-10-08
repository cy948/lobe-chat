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

  activeSessionId: string;

  nodeDetail?: FlowNodeMeta;

  messagesInit: boolean;
}

export const initialFlowCanvasState: FlowCanvasState = {
  activeSessionId: 'inbox',
  loadingTopic: false,
  nodes: [],
  edges: [],
  nodeMetaMap: {},
  nodeDetail: undefined,
  messagesInit: false,
};

