import { type AgentEvalExperimentDetail, type AgentEvalExperimentListItem } from '@lobechat/types';

export interface ExperimentSliceState {
  experimentDetailMap: Record<string, AgentEvalExperimentDetail>;
  experimentList: AgentEvalExperimentListItem[];
  experimentListInit: boolean;
  isCreatingExperiment: boolean;
  isLoadingExperimentList: boolean;
  loadingExperimentDetailIds: string[];
}

export const experimentInitialState: ExperimentSliceState = {
  experimentDetailMap: {},
  experimentList: [],
  experimentListInit: false,
  isCreatingExperiment: false,
  isLoadingExperimentList: true,
  loadingExperimentDetailIds: [],
};
