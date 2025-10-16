export interface GraphPortalState {
  activeNodeId?: string;
  inputMessage: string;
  inputSummary: string;
  showPortal: boolean;
  showSideBar: boolean;
}

export const initialGraphPortalState: GraphPortalState = {
  inputMessage: '',
  inputSummary: '',
  showPortal: false,
  showSideBar: false,
};
