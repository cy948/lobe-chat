import isEqual from 'fast-deep-equal';
import type { SWRResponse } from 'swr';

import { mutate, useClientDataSWR } from '@/libs/swr';
import { agentEvalService } from '@/services/agentEval';
import type { EvalStore } from '@/store/eval/store';
import { type StoreSetter } from '@/store/types';

type Setter = StoreSetter<EvalStore>;

const FETCH_EXPERIMENTS_KEY = 'FETCH_EVAL_EXPERIMENTS';
const FETCH_EXPERIMENT_DETAIL_KEY = 'FETCH_EVAL_EXPERIMENT_DETAIL';

export const createExperimentSlice = (set: Setter, get: () => EvalStore, _api?: unknown) =>
  new ExperimentActionImpl(set, get, _api);

export class ExperimentActionImpl {
  readonly #get: () => EvalStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => EvalStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  createExperiment = async (params: {
    benchmarkIds: string[];
    description?: string;
    metadata?: Record<string, unknown>;
    name: string;
  }) => {
    this.#set({ isCreatingExperiment: true }, false, 'createExperiment/start');
    try {
      const result = await agentEvalService.createExperiment(params);
      await this.#get().refreshExperiments();
      return result.data;
    } finally {
      this.#set({ isCreatingExperiment: false }, false, 'createExperiment/end');
    }
  };

  deleteExperiment = async (id: string) => {
    await agentEvalService.deleteExperiment(id);
    this.#set(
      (state) => ({
        experimentList: state.experimentList.filter((item) => item.id !== id),
      }),
      false,
      'deleteExperiment',
    );
    await this.#get().refreshExperiments();
  };

  internal_setExperimentDetail = (
    id: string,
    value: EvalStore['experimentDetailMap'][string],
  ): void => {
    const currentMap = this.#get().experimentDetailMap;
    const nextMap = { ...currentMap, [id]: value };

    if (isEqual(currentMap, nextMap)) return;

    this.#set({ experimentDetailMap: nextMap }, false, 'setExperimentDetail');
  };

  internal_updateExperimentDetailLoading = (id: string, loading: boolean): void => {
    this.#set(
      (state) => ({
        loadingExperimentDetailIds: loading
          ? [...state.loadingExperimentDetailIds, id]
          : state.loadingExperimentDetailIds.filter((item) => item !== id),
      }),
      false,
      'updateExperimentDetailLoading',
    );
  };

  refreshExperimentDetail = async (id: string): Promise<void> => {
    await mutate([FETCH_EXPERIMENT_DETAIL_KEY, id]);
  };

  refreshExperiments = async (): Promise<void> => {
    await mutate(FETCH_EXPERIMENTS_KEY);
  };

  useFetchExperimentDetail = (id?: string): SWRResponse =>
    useClientDataSWR(
      id ? [FETCH_EXPERIMENT_DETAIL_KEY, id] : null,
      () => agentEvalService.getExperiment(id!),
      {
        onSuccess: (data: any) => {
          this.#get().internal_setExperimentDetail(id!, data.data);
          this.#get().internal_updateExperimentDetailLoading(id!, false);
        },
      },
    );

  useFetchExperiments = (): SWRResponse =>
    useClientDataSWR(FETCH_EXPERIMENTS_KEY, () => agentEvalService.listExperiments(), {
      onSuccess: (data: any) => {
        this.#set(
          {
            experimentList: data.data,
            experimentListInit: true,
            isLoadingExperimentList: false,
          },
          false,
          'useFetchExperiments/success',
        );
      },
    });
}

export type ExperimentAction = Pick<ExperimentActionImpl, keyof ExperimentActionImpl>;
