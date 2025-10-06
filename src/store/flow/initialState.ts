import { initialFlowCanvasState, FlowCanvasState } from './slices/canvas/initialState';
import { initialAiChatState, FlowAIChatState } from './slices/aiChat/initialState';

export type FlowStoreState = FlowCanvasState & FlowAIChatState;

export const initialState: FlowStoreState = {
  ...initialFlowCanvasState,
  ...initialAiChatState,
};
