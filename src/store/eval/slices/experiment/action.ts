import isEqual from 'fast-deep-equal';
import type { SWRResponse } from 'swr';

import { mutate, useClientDataSWR } from '@/libs/swr';
import { evalKeys } from '@/libs/swr/keys';
import { agentEvalService } from '@/services/agentEval';
import type { EvalStore } from '@/store/eval/store';
import { type StoreSetter } from '@/store/types';

type Setter = StoreSetter<EvalStore>;

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

  updateExperiment = async (params: {
    benchmarkIds?: string[];
    description?: string;
    id: string;
    metadata?: Record<string, unknown>;
    name?: string;
  }) => {
    this.#set({ isCreatingExperiment: true }, false, 'updateExperiment/start');
    try {
      const result = await agentEvalService.updateExperiment(params);
      await Promise.all([
        this.#get().refreshExperiments(),
        this.#get().refreshExperimentDetail(params.id),
      ]);
      return result.data;
    } finally {
      this.#set({ isCreatingExperiment: false }, false, 'updateExperiment/end');
    }
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
    await mutate(evalKeys.experimentDetail(id));
  };

  refreshExperiments = async (): Promise<void> => {
    await mutate(evalKeys.experiments());
  };

  useFetchExperimentDetail = (id?: string): SWRResponse =>
    useClientDataSWR(
      id ? evalKeys.experimentDetail(id) : null,
      () => agentEvalService.getExperiment(id!),
      {
        onSuccess: (data: any) => {
          this.#get().internal_setExperimentDetail(id!, data.data);
          this.#get().internal_updateExperimentDetailLoading(id!, false);
        },
      },
    );

  useFetchExperiments = (): SWRResponse =>
    useClientDataSWR(evalKeys.experiments(), () => agentEvalService.listExperiments(), {
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
