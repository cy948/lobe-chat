import { GraphCanvasState, initialGraphCanvasState } from './slices/canvas/initialState';
import { GraphMessageState, initialGraphMessageState } from './slices/message/initialState';
import { GraphPortalState, initialGraphPortalState } from './slices/portal/initialState';
import { GraphChatState, initialGraphChatState } from './slices/chat/initialState';

export type GraphStoreState =
  GraphCanvasState & GraphMessageState & GraphPortalState & GraphChatState;

export const initialState: GraphStoreState = {
  ...initialGraphCanvasState,
  ...initialGraphMessageState,
  ...initialGraphPortalState,
  ...initialGraphChatState,
};
