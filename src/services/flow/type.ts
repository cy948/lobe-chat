import { FlowState } from '@/types/flow';

export interface IFlowService {
  createCanvasState(topicId: string): Promise<string>;
  getCanvasState(stateId?: string): Promise<FlowState | undefined>;
  removeNodeMeta(id: string): Promise<void>;
  updateCanvasState(topicId: string, state: Partial<FlowState>): Promise<string>;
}
