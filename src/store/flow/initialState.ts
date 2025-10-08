import { initialFlowCanvasState, FlowCanvasState } from './slices/canvas/initialState';
import { initialAiChatState, FlowAIChatState } from './slices/aiChat/initialState';
import { initialFlowDetailBoxState, FlowDetailBoxState } from './slices/detailBox/initialState';
import { initialFlowMessageState, FlowMessageState } from './slices/message/initialState';

export type FlowStoreState = 
  FlowCanvasState & FlowAIChatState & FlowDetailBoxState & FlowMessageState; 

export const initialState: FlowStoreState = {
  ...initialFlowCanvasState,
  ...initialAiChatState,
  ...initialFlowDetailBoxState,
  ...initialFlowMessageState,
};
