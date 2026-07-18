'use client';

import { createModal, type ImperativeModalProps, type ModalInstance } from '@lobehub/ui/base-ui';
import { t } from 'i18next';

import DatasetImportContent from './Content';
import DatasetImportFooter from './Footer';
import type { MappingTarget } from './MappingStep';

interface CreateOptions {
  datasetId: string;
  initialImportState?: {
    filename?: string;
    format: 'csv' | 'json' | 'jsonl' | 'xlsx';
    headers: string[];
    mapping?: Record<string, MappingTarget>;
    pathname: string;
    preview: Record<string, unknown>[];
    totalCount: number;
  };
  onClose?: () => Promise<void> | void;
  onSuccess?: (datasetId: string) => void;
  presetId?: string;
}

export const createDatasetImportModal = ({
  datasetId,
  initialImportState,
  onClose,
  onSuccess,
  presetId,
}: CreateOptions): ModalInstance => {
  const ref: { instance?: ModalInstance } = {};
  let step: 0 | 1 = 0;
  let canImport = false;
  let importing = false;
  let completed = false;
  let runImport: () => Promise<void> = async () => {};
  let prev: () => void = () => {};

  const renderFooter = () => {
    if (step === 0) return null;

    return (
      <DatasetImportFooter
        canImport={canImport}
        importing={importing}
        onImport={async () => {
          importing = true;
          ref.instance?.update({ footer: renderFooter() } as Partial<ImperativeModalProps>);
          try {
            await runImport();
            completed = true;
          } finally {
            importing = false;
            ref.instance?.update({ footer: renderFooter() } as Partial<ImperativeModalProps>);
          }
        }}
        onPrev={prev}
      />
    );
  };

  ref.instance = createModal({
    content: (
      <DatasetImportContent
        close={() => ref.instance?.close()}
        datasetId={datasetId}
        initialImportState={initialImportState}
        presetId={presetId}
        setPrev={(fn) => {
          prev = fn;
        }}
        onImportReady={(api) => {
          runImport = api.runImport;
        }}
        onStateChange={(next) => {
          if (next.step === step && next.canImport === canImport) return;
          step = next.step;
          canImport = next.canImport;
          ref.instance?.update({ footer: renderFooter() } as Partial<ImperativeModalProps>);
        }}
        onSuccess={onSuccess}
      />
    ),
    footer: renderFooter(),
    maskClosable: false,
    onOpenChange: (open) => {
      if (!open && !completed) void onClose?.();
    },
    title: t('dataset.import.title', { ns: 'eval' }),
    width: 720,
  });

  return ref.instance;
};
