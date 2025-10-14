import { debounce } from 'lodash-es';

import { CanvasState, GraphNodeMeta } from '@/types/graph';

export interface GraphCanvasState {
  activeSessionId: string;
  activeStateId?: string;
  // 为每个 stateId 创建防抖函数
  debouncedUpdateMap: Map<string, ReturnType<typeof debounce>>;
  isStateInit: boolean;
  nodeMetaMap: Record<string, GraphNodeMeta>;
  /**
   * @title 图
   */
  // 存储待更新的状态
  pendingUpdates: Map<string, Partial<CanvasState>>;

  stateMap: Record<string, CanvasState>;
}

export const initialGraphCanvasState: GraphCanvasState = {
  // TODO: should allow user to select session
  activeSessionId: 'inbox',
  debouncedUpdateMap: new Map<string, ReturnType<typeof debounce>>(),
  isStateInit: false,
  nodeMetaMap: {},
  pendingUpdates: new Map<string, Partial<CanvasState>>(),
  stateMap: {},
};
