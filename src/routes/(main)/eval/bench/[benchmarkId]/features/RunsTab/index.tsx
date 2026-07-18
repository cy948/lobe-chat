'use client';

import { memo } from 'react';

import { createRunCreateModal, createRunEditModal, RunListSection } from '@/features/EvalRuns';
import { runSelectors, useEvalStore } from '@/store/eval';

interface RunsTabProps {
  benchmarkId: string;
}

const RunsTab = memo<RunsTabProps>(({ benchmarkId }) => {
  const useFetchRuns = useEvalStore((s) => s.useFetchRuns);
  const runList = useEvalStore(runSelectors.runList);
  const refreshRuns = useEvalStore((s) => s.refreshRuns);
  useFetchRuns(benchmarkId);

  return (
    <>
      <RunListSection
        benchmarkId={benchmarkId}
        runs={runList}
        onCreate={() => createRunCreateModal({ benchmarkId })}
        onEdit={(run) => createRunEditModal({ run })}
        onFork={(run) =>
          createRunCreateModal({
            benchmarkId,
            datasetId: run.datasetId,
            datasetName: run.datasetName,
            parentRunId: run.id,
            parentRunName: run.name || run.id,
          })
        }
        onRefresh={refreshRuns}
      />
    </>
  );
});

export default RunsTab;
