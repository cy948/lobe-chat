import { GraphCanvasState, initialGraphCanvasState } from './slices/canvas/initialState';
import { GraphMessageState, initialGraphMessageState } from './slices/message/initialState';

export type GraphStoreState = 
  GraphCanvasState & GraphMessageState;

export const initialState: GraphStoreState = {
  ...initialGraphCanvasState,
  ...initialGraphMessageState,
};
