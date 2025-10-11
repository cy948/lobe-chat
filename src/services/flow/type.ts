import { FlowState, FlowNodeMeta } from "@/types/flow";

export interface IFlowService {
    createCanvasState(topicId: string): Promise<FlowState>;
    getCanvasState(topicId: string): Promise<FlowState | undefined>;
    getNodeMetas: (topicId: string) => Promise<FlowNodeMeta[]>;
    removeNodeMeta(id: string): Promise<void>;
    updateCanvasState(topicId: string, state: Partial<FlowState>): Promise<FlowState>;
}