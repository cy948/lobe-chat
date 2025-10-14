import { debounce } from 'lodash-es'
import { CanvasState, GraphNodeMeta } from '@/types/graph';

export interface GraphCanvasState {
  activeSessionId: string;
  activeStateId?: string;
  stateMap: Record<string, CanvasState>;
  nodeMetaMap: Record<string, GraphNodeMeta>;
  isStateInit: boolean;
  /**
   * @title 图
   */
  // 存储待更新的状态
  pendingUpdates: Map<string, Partial<CanvasState>>;

  // 为每个 stateId 创建防抖函数
  debouncedUpdateMap: Map<string, ReturnType<typeof debounce>>;
}

export const initialGraphCanvasState: GraphCanvasState = {
  // TODO: should allow user to select session
  activeSessionId: 'inbox',
  isStateInit: false,
  stateMap: {},
  nodeMetaMap: {},
  pendingUpdates: new Map<string, Partial<CanvasState>>(),
  debouncedUpdateMap: new Map<string, ReturnType<typeof debounce>>(),
};
