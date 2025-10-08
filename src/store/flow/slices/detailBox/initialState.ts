

export interface FlowDetailBoxState {
    detailBoxVisible: boolean;

    activeNodeId?: string;

    isCreatingNode?: boolean;
    isCreatingMessage?: boolean;

    isDetailBoxInitialized?: boolean;

    inputMessage: string;

    inputSummary: string;

}

export const initialFlowDetailBoxState: FlowDetailBoxState = {
    detailBoxVisible: false,
    activeNodeId: undefined,
    isCreatingNode: false,
    isCreatingMessage: false,
    inputMessage: '',
    inputSummary: '',
};
