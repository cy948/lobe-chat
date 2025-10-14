import { GraphState } from '@/types/graph';

export interface IGraphService {
  fetchState: (stateId?: string) => Promise<GraphState | undefined>;
}
