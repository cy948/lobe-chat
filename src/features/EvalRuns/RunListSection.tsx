'use client';

import type { AgentEvalRunListItem } from '@lobechat/types';
import { Flexbox } from '@lobehub/ui';
import { Button, Select } from '@lobehub/ui/base-ui';
import { Plus } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import EmptyState from './EmptyState';
import RunCard from './RunCard';

interface RunListSectionProps {
  benchmarkId: string;
  createLabel?: string;
  emptyDescription?: string;
  experimentId?: string;
  hideCreate?: boolean;
  onCreate?: () => void;
  onEdit?: (run: AgentEvalRunListItem) => void;
  onFork?: (run: AgentEvalRunListItem) => void;
  onRefresh?: () => Promise<void>;
  runs: AgentEvalRunListItem[];
}

interface OrderedRunItem {
  childCount: number;
  depth: number;
  parentName?: string;
  run: AgentEvalRunListItem;
}

const MAX_VISUAL_DEPTH = 2;

const RunListSection = memo<RunListSectionProps>(
  ({
    benchmarkId,
    createLabel,
    emptyDescription,
    experimentId,
    hideCreate,
    onCreate,
    onEdit,
    onFork,
    onRefresh,
    runs,
  }) => {
    const { t } = useTranslation('eval');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    const sortedRuns = useMemo(
      () =>
        [...runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      [runs],
    );

    const filteredRuns = useMemo(() => {
      if (statusFilter === 'all') return sortedRuns;
      if (statusFilter === 'active') {
        return sortedRuns.filter((r) => r.status === 'running' || r.status === 'pending');
      }
      return sortedRuns.filter((r) => r.status === statusFilter);
    }, [sortedRuns, statusFilter]);

    const orderedRuns = useMemo<OrderedRunItem[]>(() => {
      const runMap = new Map(filteredRuns.map((run) => [run.id, run]));
      const childMap = new Map<string, AgentEvalRunListItem[]>();
      const subtreeLatestMap = new Map<string, number>();

      for (const run of filteredRuns) {
        if (!run.parentRunId || !runMap.has(run.parentRunId)) continue;

        const children = childMap.get(run.parentRunId) || [];
        children.push(run);
        childMap.set(run.parentRunId, children);
      }

      const getSubtreeLatestTime = (runId: string): number => {
        const cached = subtreeLatestMap.get(runId);
        if (cached !== undefined) return cached;

        const run = runMap.get(runId);
        if (!run) return 0;

        const ownTime = new Date(run.createdAt).getTime();
        const children = childMap.get(runId) || [];
        const latest = Math.max(
          ownTime,
          ...children.map((child) => getSubtreeLatestTime(child.id)),
        );

        subtreeLatestMap.set(runId, latest);

        return latest;
      };

      const rootRuns = filteredRuns.filter(
        (run) => !run.parentRunId || !runMap.has(run.parentRunId),
      );
      const rootRunsByGroupTime = [...rootRuns].sort((a, b) => {
        return getSubtreeLatestTime(b.id) - getSubtreeLatestTime(a.id);
      });

      const result: OrderedRunItem[] = [];
      const appendRunTree = (run: AgentEvalRunListItem, depth: number, parentName?: string) => {
        const children = [...(childMap.get(run.id) || [])].sort(
          (a, b) => getSubtreeLatestTime(b.id) - getSubtreeLatestTime(a.id),
        );

        result.push({
          childCount: children.length,
          depth: Math.min(depth, MAX_VISUAL_DEPTH),
          parentName,
          run,
        });

        for (const childRun of children) {
          appendRunTree(childRun, depth + 1, run.name || run.id);
        }
      };

      for (const rootRun of rootRunsByGroupTime) {
        appendRunTree(rootRun, 0);
      }

      return result;
    }, [filteredRuns]);

    const statusOptions = [
      { label: t('table.filter.all'), value: 'all' },
      { label: t('run.status.completed'), value: 'completed' },
      { label: t('run.filter.active'), value: 'active' },
      { label: t('run.status.idle'), value: 'idle' },
      { label: t('run.status.failed'), value: 'failed' },
      { label: t('run.status.aborted'), value: 'aborted' },
    ];

    return (
      <Flexbox gap={16}>
        {sortedRuns.length > 0 && (
          <Flexbox horizontal align="center" justify="space-between">
            <Flexbox horizontal align="center" gap={8}>
              <p style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 14, margin: 0 }}>
                {t('benchmark.detail.runCount', { count: filteredRuns.length })}
              </p>
              <Select
                options={statusOptions}
                size="small"
                style={{ width: 128 }}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </Flexbox>
            {!hideCreate && onCreate && (
              <Button icon={Plus} size="small" type="primary" onClick={onCreate}>
                {createLabel || t('run.actions.create')}
              </Button>
            )}
          </Flexbox>
        )}

        {sortedRuns.length === 0 ? (
          <EmptyState
            description={emptyDescription}
            hideCreate={hideCreate}
            onCreate={onCreate || (() => {})}
          />
        ) : filteredRuns.length === 0 ? (
          <p style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 14, textAlign: 'center' }}>
            {t('run.filter.empty')}
          </p>
        ) : (
          <Flexbox gap={12}>
            {orderedRuns.map(({ childCount, depth, parentName, run }) => (
              <RunCard
                benchmarkId={benchmarkId}
                childCount={childCount}
                depth={depth}
                experimentId={experimentId}
                key={run.id}
                parentName={parentName}
                run={run}
                onEdit={onEdit}
                onFork={onFork}
                onRefresh={onRefresh}
              />
            ))}
          </Flexbox>
        )}
      </Flexbox>
    );
  },
);

export default RunListSection;
