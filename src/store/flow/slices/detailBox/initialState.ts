export interface FlowDetailBoxState {
  activeNodeId?: string;

  detailBoxVisible: boolean;

  inputMessage: string;
  inputSummary: string;

  isCreatingMessage?: boolean;

  isCreatingNode?: boolean;

  isDetailBoxInitialized?: boolean;
}

export const initialFlowDetailBoxState: FlowDetailBoxState = {
  activeNodeId: undefined,
  detailBoxVisible: false,
  inputMessage: '',
  inputSummary: '',
  isCreatingMessage: false,
  isCreatingNode: false,
};
