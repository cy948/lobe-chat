'use client';

import type { AgentEvalDatasetListItem, AgentEvalRunListItem } from '@lobechat/types';
import { ActionIcon, Empty, Flexbox, Text } from '@lobehub/ui';
import { Button, type DropdownItem, DropdownMenu } from '@lobehub/ui/base-ui';
import { App, Card } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  ChevronRight,
  Ellipsis,
  GitBranch,
  Layers,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { EvalStatCard } from '@/features/EvalCommon';
import {
  createDatasetCreateModal,
  createDatasetImportModal,
  DatasetListItem,
  type MappingTarget,
  TestCaseTable,
} from '@/features/EvalDatasets';
import { createRunCreateModal, RunListSection } from '@/features/EvalRuns';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { agentEvalService } from '@/services/agentEval';
import { experimentSelectors, useEvalStore } from '@/store/eval';

import { createExperimentModal } from './ExperimentCreateModal';

const styles = createStaticStyles(({ css, cssVar }) => ({
  listCard: css`
    .ant-card-body {
      padding: 0;
    }
  `,
  listItem: css`
    & + & {
      border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  container: css`
    overflow-y: auto;
    padding-block: 24px;
    padding-inline: 32px;
  `,
  expandedSection: css`
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  statValue: css`
    font-size: 20px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  meta: css`
    font-size: 13px;
    color: ${cssVar.colorTextTertiary};
  `,
  sectionTitle: css`
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  `,
}));

const ExperimentDetailPage = memo(() => {
  const { t } = useTranslation('eval');
  const { experimentId } = useParams<{ experimentId: string }>();
  const navigate = useWorkspaceAwareNavigate();
  const { modal } = App.useApp();
  const [expandedDatasetId, setExpandedDatasetId] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 5 });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const useFetchExperimentDetail = useEvalStore((s) => s.useFetchExperimentDetail);
  const useFetchTestCases = useEvalStore((s) => s.useFetchTestCases);
  const experiment = useEvalStore(experimentSelectors.getExperimentDetailById(experimentId || ''));
  const currentExperimentId = experiment?.id;
  const deleteExperiment = useEvalStore((s) => s.deleteExperiment);

  useFetchExperimentDetail(experimentId);
  const { data: testCaseData, isLoading: testCasesLoading } = useFetchTestCases(
    expandedDatasetId
      ? {
          datasetId: expandedDatasetId,
          limit: pagination.pageSize,
          offset: (pagination.current - 1) * pagination.pageSize,
        }
      : { datasetId: '', limit: 0, offset: 0 },
  );

  const benchmarks = useMemo(() => experiment?.benchmarks || [], [experiment]);
  const benchmarkIds = useMemo(() => benchmarks.map((benchmark) => benchmark.id), [benchmarks]);
  const experimentDatasetsKey = useMemo(
    () => (benchmarkIds.length > 0 ? ['experiment-datasets', experimentId, ...benchmarkIds] : null),
    [benchmarkIds, experimentId],
  );
  const { data: experimentDatasets = [] } = useClientDataSWR(experimentDatasetsKey, async () => {
    const datasetGroups = await Promise.all(
      benchmarkIds.map((benchmarkId) => agentEvalService.listDatasets(benchmarkId)),
    );

    const datasetMap = new Map<string, AgentEvalDatasetListItem>();
    for (const datasets of datasetGroups) {
      for (const dataset of datasets) {
        if (!datasetMap.has(dataset.id)) {
          datasetMap.set(dataset.id, dataset);
        }
      }
    }

    return [...datasetMap.values()];
  });

  const { baselineDatasets, scopedDatasets } = useMemo(
    () => ({
      baselineDatasets: experimentDatasets.filter(
        (dataset): dataset is AgentEvalDatasetListItem => !!dataset && !dataset.sourceExperimentId,
      ),
      scopedDatasets: experimentDatasets.filter(
        (dataset): dataset is AgentEvalDatasetListItem =>
          !!dataset && dataset.sourceExperimentId === experimentId,
      ),
    }),
    [experimentDatasets, experimentId],
  );
  const datasets = useMemo<AgentEvalDatasetListItem[]>(
    () => [...baselineDatasets, ...scopedDatasets],
    [baselineDatasets, scopedDatasets],
  );
  const testCases = (testCaseData?.data || []) as Array<{
    content?: { category?: string; input?: string };
  }>;
  const totalTestCases = testCaseData?.total || 0;
  const filteredTestCases = testCases.filter((testCase) => {
    if (categoryFilter !== 'all' && testCase.content?.category !== categoryFilter) return false;
    if (search && !testCase.content?.input?.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });
  const categories: string[] = [];
  for (const testCase of testCases) {
    const category = testCase.content?.category;
    if (typeof category === 'string' && category.length > 0 && !categories.includes(category)) {
      categories.push(category);
    }
  }
  const runs = useMemo<AgentEvalRunListItem[]>(() => experiment?.runs || [], [experiment]);
  const branchCount = useMemo(() => {
    const parentIds = new Set(runs.map((run) => run.parentRunId).filter(Boolean));

    return runs.filter((run) => parentIds.has(run.id)).length;
  }, [runs]);
  const datasetMap = useMemo(
    () => new Map(datasets.map((dataset) => [dataset.id, dataset])),
    [datasets],
  );
  const benchmarkOptions = useMemo(
    () => benchmarks.map((benchmark) => ({ id: benchmark.id, name: benchmark.name })),
    [benchmarks],
  );
  const baselineDatasetOptions = useMemo(
    () =>
      baselineDatasets.map((dataset) => ({
        benchmarkId: dataset.benchmarkId,
        id: dataset.id,
        name: dataset.name,
      })),
    [baselineDatasets],
  );
  const benchmarkDatasetGroups = useMemo(
    () =>
      benchmarks.map((benchmark) => ({
        benchmark,
        datasets: baselineDatasets.filter((dataset) => dataset.benchmarkId === benchmark.id),
      })),
    [baselineDatasets, benchmarks],
  );
  const handleImportRequest = useCallback(
    ({
      datasetId,
      importState: nextImportState,
      preset,
    }: {
      datasetId: string;
      importState?: {
        filename?: string;
        format: 'csv' | 'json' | 'jsonl' | 'xlsx';
        headers: string[];
        mapping: Record<string, MappingTarget>;
        pathname: string;
        preview: Record<string, unknown>[];
        totalCount: number;
      };
      preset: string;
    }) => {
      const isPendingForkImport = !!nextImportState;
      createDatasetImportModal({
        datasetId,
        initialImportState: nextImportState,
        onClose: async () => {
          if (!isPendingForkImport) return;

          try {
            await agentEvalService.deleteDataset(datasetId);
          } finally {
            if (currentExperimentId) {
              useEvalStore.getState().refreshExperimentDetail(currentExperimentId);
            }
          }
        },
        onSuccess: () => {
          if (!currentExperimentId) return;
          useEvalStore.getState().refreshExperimentDetail(currentExperimentId);
        },
        presetId: preset,
      });
    },
    [currentExperimentId],
  );
  const handleExpandDataset = (datasetId: string) => {
    setExpandedDatasetId((prev) => (prev === datasetId ? null : datasetId));
    setPagination({ current: 1, pageSize: 5 });
    setSearch('');
    setCategoryFilter('all');
  };
  const handleDeleteDataset = useCallback(
    (datasetId: string) => {
      modal.confirm({
        content: t('dataset.delete.confirm'),
        okButtonProps: { danger: true },
        okText: t('common.delete'),
        onOk: async () => {
          await agentEvalService.deleteDataset(datasetId);
          if (expandedDatasetId === datasetId) {
            setExpandedDatasetId(null);
          }
          if (!currentExperimentId) return;

          await Promise.all([
            useEvalStore.getState().refreshExperimentDetail(currentExperimentId),
            experimentDatasetsKey ? mutate(experimentDatasetsKey) : Promise.resolve(),
          ]);
        },
        title: t('common.delete'),
      });
    },
    [currentExperimentId, expandedDatasetId, experimentDatasetsKey, modal, t],
  );
  const menuItems = [
    {
      danger: true,
      icon: <Trash2 size={16} />,
      key: 'delete',
      label: t('common.delete'),
      onClick: () =>
        modal.confirm({
          content: t('experiment.actions.delete.confirm'),
          okButtonProps: { danger: true },
          okText: t('experiment.actions.delete'),
          onOk: async () => {
            await deleteExperiment(experiment!.id);
            navigate('/eval');
          },
          title: t('experiment.actions.delete'),
        }),
    },
  ];

  if (!experimentId || !experiment) return null;

  return (
    <Flexbox className={styles.container} gap={24} height="100%" width="100%">
      <Flexbox horizontal align="start" justify="space-between">
        <Flexbox gap={6}>
          <Text as="h3" style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
            {experiment.name}
          </Text>
          {experiment.description && <Text type="secondary">{experiment.description}</Text>}
          <span className={styles.meta}>
            {t('experiment.detail.lastAccessed', {
              time: new Date(experiment.accessedAt).toLocaleString(),
            })}
          </span>
        </Flexbox>
        <Flexbox horizontal gap={8}>
          <Button
            icon={Pencil}
            onClick={() =>
              createExperimentModal({
                experiment,
                onSuccess: () => useEvalStore.getState().refreshExperimentDetail(experiment.id),
              })
            }
          >
            {t('common.edit')}
          </Button>
          <DropdownMenu items={menuItems} trigger={['click']}>
            <Button icon={Ellipsis} />
          </DropdownMenu>
        </Flexbox>
      </Flexbox>

      <Flexbox horizontal gap={12}>
        <EvalStatCard
          icon={Layers}
          iconBackground={cssVar.colorPrimaryBg}
          iconColor={cssVar.colorPrimary}
          label={t('experiment.detail.stats.benchmarks')}
        >
          <span className={styles.statValue}>{benchmarks.length}</span>
        </EvalStatCard>

        <EvalStatCard
          icon={Play}
          iconBackground={cssVar.colorSuccessBg}
          iconColor={cssVar.colorSuccess}
          label={t('experiment.detail.stats.runs')}
        >
          <span className={styles.statValue}>{runs.length}</span>
        </EvalStatCard>

        <EvalStatCard
          icon={GitBranch}
          iconBackground={cssVar.colorWarningBg}
          iconColor={cssVar.colorWarning}
          label={t('experiment.detail.stats.branches')}
        >
          <span className={styles.statValue}>{branchCount}</span>
        </EvalStatCard>
      </Flexbox>

      <h3 className={styles.sectionTitle}>{t('experiment.detail.benchmarks')}</h3>
      <Flexbox gap={12}>
        {benchmarkDatasetGroups.map(({ benchmark, datasets: benchmarkDatasets }) => (
          <Card
            className={styles.listCard}
            key={benchmark.id}
            title={benchmark.name}
            extra={
              <WorkspaceLink to={`/eval/bench/${benchmark.id}`}>
                <ActionIcon icon={ChevronRight} size={'small'} />
              </WorkspaceLink>
            }
          >
            {benchmarkDatasets.length === 0 ? (
              <Empty
                description={t('experiment.detail.benchmarksEmpty')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              <Flexbox gap={0}>
                {benchmarkDatasets.map((dataset) => {
                  const isExpanded = expandedDatasetId === dataset.id;
                  const dropdownItems: DropdownItem[] = [
                    {
                      key: 'subset',
                      label: t('experiment.detail.datasetActions.createSubset'),
                      onClick: () => {
                        const sourceDataset = {
                          benchmarkId: benchmark.id,
                          datasetId: dataset.id,
                          evalMode: dataset.evalMode,
                          metadata: (
                            dataset as AgentEvalDatasetListItem & {
                              metadata?: Record<string, unknown> | null;
                            }
                          ).metadata,
                          name: dataset.name,
                          testCaseCount: dataset.testCaseCount,
                        };
                        createDatasetCreateModal({
                          benchmarkId: sourceDataset.benchmarkId,
                          defaultMode: 'fork',
                          defaultSourceDatasetDraft: {
                            evalMode: sourceDataset.evalMode,
                            metadata: sourceDataset.metadata,
                            name: sourceDataset.name,
                            testCaseCount: sourceDataset.testCaseCount,
                          },
                          defaultSourceDatasetId: sourceDataset.datasetId,
                          experimentDatasets: baselineDatasetOptions,
                          onImportRequest: handleImportRequest,
                          onSuccess: () =>
                            useEvalStore.getState().refreshExperimentDetail(experiment.id),
                          sourceExperimentId: experiment.id,
                        });
                      },
                    },
                    {
                      key: 'run',
                      label: t('dataset.detail.addRun'),
                      onClick: () =>
                        createRunCreateModal({
                          benchmarkId: dataset.benchmarkId,
                          datasetId: dataset.id,
                          datasetName: dataset.name,
                          experimentId: experiment.id,
                        }),
                    },
                  ];

                  return (
                    <div className={styles.listItem} key={dataset.id}>
                      <DatasetListItem
                        dataset={dataset}
                        trailing={
                          <>
                            <DropdownMenu items={dropdownItems}>
                              <ActionIcon icon={MoreHorizontal} size={'small'} />
                            </DropdownMenu>
                            <ActionIcon
                              icon={ChevronRight}
                              size={'small'}
                              style={{
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s',
                              }}
                              onClick={() => handleExpandDataset(dataset.id)}
                            />
                          </>
                        }
                      />
                      {isExpanded && (
                        <div className={styles.expandedSection}>
                          <TestCaseTable
                            readOnly
                            categories={categories}
                            categoryFilter={categoryFilter}
                            datasetEvalMode={dataset.evalMode}
                            pagination={pagination}
                            search={search}
                            testCases={testCasesLoading ? [] : filteredTestCases}
                            total={testCasesLoading ? 0 : totalTestCases}
                            onCategoryFilterChange={(filter) => {
                              setCategoryFilter(filter);
                              setPagination((prev) => ({ ...prev, current: 1 }));
                            }}
                            onPageChange={(page, pageSize) =>
                              setPagination({ current: page, pageSize })
                            }
                            onSearchChange={(value) => {
                              setSearch(value);
                              setPagination((prev) => ({ ...prev, current: 1 }));
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </Flexbox>
            )}
          </Card>
        ))}
      </Flexbox>

      <Flexbox horizontal align="center" justify="space-between">
        <h3 className={styles.sectionTitle}>{t('experiment.detail.datasetsScoped')}</h3>
        <Button
          icon={Plus}
          size="small"
          onClick={() =>
            createDatasetCreateModal({
              benchmarkOptions,
              experimentDatasets: baselineDatasetOptions,
              onImportRequest: handleImportRequest,
              onSuccess: () => useEvalStore.getState().refreshExperimentDetail(experiment.id),
              sourceExperimentId: experiment.id,
            })
          }
        >
          {t('experiment.detail.datasetActions.create')}
        </Button>
      </Flexbox>
      <Card className={styles.listCard}>
        {scopedDatasets.length === 0 ? (
          <Empty
            description={t('experiment.detail.datasetsScopedEmpty')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Flexbox gap={0}>
            {scopedDatasets.map((dataset) => {
              const isExpanded = expandedDatasetId === dataset.id;
              const dropdownItems: DropdownItem[] = [
                {
                  key: 'run',
                  label: t('dataset.detail.addRun'),
                  onClick: () =>
                    createRunCreateModal({
                      benchmarkId: dataset.benchmarkId,
                      datasetId: dataset.id,
                      datasetName: dataset.name,
                      experimentId: experiment.id,
                    }),
                },
                {
                  danger: true,
                  key: 'delete',
                  label: t('common.delete'),
                  onClick: () => handleDeleteDataset(dataset.id),
                },
              ];

              return (
                <div className={styles.listItem} key={dataset.id}>
                  <DatasetListItem
                    dataset={dataset}
                    trailing={
                      <>
                        <DropdownMenu items={dropdownItems}>
                          <ActionIcon icon={MoreHorizontal} size={'small'} />
                        </DropdownMenu>
                        <ActionIcon
                          icon={ChevronRight}
                          size={'small'}
                          style={{
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s',
                          }}
                          onClick={() => handleExpandDataset(dataset.id)}
                        />
                      </>
                    }
                  />
                  {isExpanded && (
                    <div className={styles.expandedSection}>
                      <TestCaseTable
                        readOnly
                        categories={categories}
                        categoryFilter={categoryFilter}
                        datasetEvalMode={dataset.evalMode}
                        pagination={pagination}
                        search={search}
                        testCases={testCasesLoading ? [] : filteredTestCases}
                        total={testCasesLoading ? 0 : totalTestCases}
                        onCategoryFilterChange={(filter) => {
                          setCategoryFilter(filter);
                          setPagination((prev) => ({ ...prev, current: 1 }));
                        }}
                        onPageChange={(page, pageSize) =>
                          setPagination({ current: page, pageSize })
                        }
                        onSearchChange={(value) => {
                          setSearch(value);
                          setPagination((prev) => ({ ...prev, current: 1 }));
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </Flexbox>
        )}
      </Card>

      <h3 className={styles.sectionTitle}>{t('experiment.detail.runs')}</h3>
      <RunListSection
        hideCreate
        benchmarkId={benchmarks[0]?.id || ''}
        emptyDescription={t('run.empty.description')}
        experimentId={experiment.id}
        runs={runs}
        onFork={(run) =>
          createRunCreateModal({
            benchmarkId: datasetMap.get(run.datasetId)?.benchmarkId || benchmarks[0]?.id || '',
            datasetId: run.datasetId,
            datasetName: run.datasetName,
            experimentId: experiment.id,
            parentRunId: run.id,
            parentRunName: run.name || undefined,
          })
        }
      />
    </Flexbox>
  );
});

export default ExperimentDetailPage;
