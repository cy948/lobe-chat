import { GraphCanvasState, initialGraphCanvasState } from './slices/canvas/initialState';

export type GraphStoreState = 
  GraphCanvasState;

export const initialState: GraphStoreState = {
  ...initialGraphCanvasState,
};
