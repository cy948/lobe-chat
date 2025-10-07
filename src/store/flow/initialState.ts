import { initialFlowCanvasState, FlowCanvasState } from './slices/canvas/initialState';
import { initialAiChatState, FlowAIChatState } from './slices/aiChat/initialState';
import { initialFlowDetailBoxState, FlowDetailBoxState } from './slices/detailBox/initialState';

export type FlowStoreState = FlowCanvasState & FlowAIChatState & FlowDetailBoxState;

export const initialState: FlowStoreState = {
  ...initialFlowCanvasState,
  ...initialAiChatState,
  ...initialFlowDetailBoxState,
};
