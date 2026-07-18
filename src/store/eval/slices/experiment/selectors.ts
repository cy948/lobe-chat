import type { EvalStore } from '@/store/eval/store';

const experimentList = (s: EvalStore) => s.experimentList;
const isExperimentListInit = (s: EvalStore) => s.experimentListInit;
const isLoadingExperimentList = (s: EvalStore) => s.isLoadingExperimentList;
const isCreatingExperiment = (s: EvalStore) => s.isCreatingExperiment;
const getExperimentById = (id: string) => (s: EvalStore) =>
  s.experimentList.find((e) => e.id === id);
const getExperimentDetailById = (id: string) => (s: EvalStore) => s.experimentDetailMap[id];

export const experimentSelectors = {
  experimentList,
  getExperimentById,
  getExperimentDetailById,
  isCreatingExperiment,
  isExperimentListInit,
  isLoadingExperimentList,
};
