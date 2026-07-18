import type { EvalStore } from '@/store/eval/store';

const experimentList = (s: EvalStore) => s.experimentList;
const getExperimentById = (id: string) => (s: EvalStore) =>
  s.experimentList.find((item) => item.id === id);
const getExperimentDetailById = (id: string) => (s: EvalStore) => s.experimentDetailMap[id];
const isCreatingExperiment = (s: EvalStore) => s.isCreatingExperiment;
const isExperimentListInit = (s: EvalStore) => s.experimentListInit;
const isLoadingExperimentList = (s: EvalStore) => s.isLoadingExperimentList;

export const experimentSelectors = {
  experimentList,
  getExperimentById,
  getExperimentDetailById,
  isCreatingExperiment,
  isExperimentListInit,
  isLoadingExperimentList,
};
