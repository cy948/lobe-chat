'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { App, Card, Skeleton } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { Plus } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  createDatasetCreateModal,
  createDatasetEditModal,
  createDatasetImportModal,
  createTestCaseCreateModal,
} from '@/features/EvalDatasets';
import { createRunCreateModal } from '@/features/EvalRuns';
import { agentEvalService } from '@/services/agentEval';
import { useEvalStore } from '@/store/eval';

import DatasetCard from './DatasetCard';
import EmptyState from './EmptyState';

const loadingStyles = createStaticStyles(({ css }) => ({
  card: css`
    .ant-card-body {
      padding: 0;
    }
  `,
  header: css`
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 16px;
  `,
  icon: css`
    flex-shrink: 0;

    width: 32px;
    height: 32px;
    border-radius: ${cssVar.borderRadius};

    background: ${cssVar.colorFillQuaternary};
  `,
}));

interface DatasetsTabProps {
  benchmarkId: string;
  datasets: any[];
  loading?: boolean;
  onImport: () => void;
  onRefresh: () => void;
}

const DatasetsTab = memo<DatasetsTabProps>(
  ({ benchmarkId, datasets, loading: datasetsLoading, onImport: _onImport, onRefresh }) => {
    const { t } = useTranslation('eval');
    const { modal, message } = App.useApp();
    const [expandedDs, setExpandedDs] = useState<string | null>(null);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 5 });
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');

    const useFetchTestCases = useEvalStore((s) => s.useFetchTestCases);
    const refreshTestCases = useEvalStore((s) => s.refreshTestCases);

    // Fetch test cases for expanded dataset - use SWR return value directly
    const { data: testCaseData, isLoading: loading } = useFetchTestCases(
      expandedDs
        ? {
            datasetId: expandedDs,
            limit: pagination.pageSize,
            offset: (pagination.current - 1) * pagination.pageSize,
          }
        : { datasetId: '', limit: 0, offset: 0 },
    );

    const testCases = testCaseData?.data || [];
    const total = testCaseData?.total || 0;

    const handleRefreshTestCases = useCallback(
      async (datasetId: string) => {
        await refreshTestCases(datasetId);
        onRefresh();
      },
      [refreshTestCases, onRefresh],
    );

    const filteredCases = testCases.filter((c: any) => {
      if (categoryFilter !== 'all' && c.content?.category !== categoryFilter) return false;
      if (search && !c.content?.input?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    const categories: string[] = [];
    for (const testCase of testCases) {
      const category = testCase.content?.category;
      if (typeof category === 'string' && category.length > 0 && !categories.includes(category)) {
        categories.push(category);
      }
    }

    const handleExpand = useCallback((datasetId: string) => {
      setExpandedDs((prev) => (prev === datasetId ? null : datasetId));
      setPagination({ current: 1, pageSize: 5 });
      setSearch('');
      setCategoryFilter('all');
    }, []);

    const handleSearchChange = useCallback((value: string) => {
      setSearch(value);
      setPagination((prev) => ({ ...prev, current: 1 }));
    }, []);

    const handleCategoryFilterChange = useCallback((filter: string) => {
      setCategoryFilter(filter);
      setPagination((prev) => ({ ...prev, current: 1 }));
    }, []);

    const handleDeleteCase = useCallback(
      (testCase: any) => {
        modal.confirm({
          content: t('testCase.delete.confirm'),
          okButtonProps: { danger: true },
          okText: t('common.delete'),
          onOk: async () => {
            try {
              await agentEvalService.deleteTestCase(testCase.id);
              message.success(t('testCase.delete.success'));
              if (expandedDs) await refreshTestCases(expandedDs);
              onRefresh();
            } catch {
              message.error(t('testCase.delete.error'));
            }
          },
          title: t('common.delete'),
        });
      },
      [expandedDs, message, modal, onRefresh, refreshTestCases, t],
    );

    return (
      <>
        <Flexbox gap={16}>
          {datasets.length > 0 && (
            <Flexbox horizontal align="center" justify="space-between">
              <Text color={cssVar.colorTextTertiary}>
                {t('benchmark.detail.datasetCount', { count: datasets.length })}
              </Text>
              <Button
                icon={Plus}
                size="small"
                type="primary"
                onClick={() =>
                  createDatasetCreateModal({
                    benchmarkId,
                    onSuccess: (dataset) => {
                      onRefresh();
                      modal.success({
                        cancelText: t('common.later'),
                        content: t('dataset.create.importNow'),
                        okCancel: true,
                        okText: t('dataset.actions.import'),
                        onOk: () => {
                          createDatasetImportModal({
                            datasetId: dataset.id,
                            onSuccess: handleRefreshTestCases,
                            presetId: dataset.preset,
                          });
                        },
                        title: t('dataset.create.successTitle'),
                      });
                    },
                  })
                }
              >
                {t('dataset.actions.addDataset')}
              </Button>
            </Flexbox>
          )}

          {datasetsLoading && datasets.length === 0 ? (
            <Flexbox gap={12}>
              {[1, 2, 3].map((i) => (
                <Card className={loadingStyles.card} key={i}>
                  <div className={loadingStyles.header}>
                    <div className={loadingStyles.icon} />
                    <Flexbox flex={1} gap={8}>
                      <Skeleton.Input active size="small" style={{ height: 16, width: 120 }} />
                      <Skeleton.Input active size="small" style={{ height: 12, width: 200 }} />
                    </Flexbox>
                    <Skeleton.Button active size="small" style={{ height: 36, width: 64 }} />
                    <Skeleton.Button active size="small" style={{ height: 28, width: 64 }} />
                  </div>
                </Card>
              ))}
            </Flexbox>
          ) : datasets.length === 0 ? (
            <EmptyState
              onAddDataset={() =>
                createDatasetCreateModal({
                  benchmarkId,
                  onSuccess: onRefresh,
                })
              }
            />
          ) : (
            <Flexbox gap={12}>
              {datasets.map((ds) => {
                const isExpanded = expandedDs === ds.id;
                return (
                  <DatasetCard
                    benchmarkId={benchmarkId}
                    categories={isExpanded ? categories : []}
                    categoryFilter={categoryFilter}
                    dataset={ds}
                    filteredCases={isExpanded ? filteredCases : []}
                    isExpanded={isExpanded}
                    key={ds.id}
                    loading={isExpanded ? loading : false}
                    pagination={pagination}
                    search={search}
                    total={isExpanded ? total : 0}
                    onAddCase={() =>
                      createTestCaseCreateModal({
                        datasetId: ds.id,
                        onSuccess: () => handleRefreshTestCases(ds.id),
                      })
                    }
                    onCategoryFilterChange={handleCategoryFilterChange}
                    onDeleteCase={handleDeleteCase}
                    onEdit={(dataset) => createDatasetEditModal({ dataset, onSuccess: onRefresh })}
                    onExpand={() => handleExpand(ds.id)}
                    onImport={() =>
                      createDatasetImportModal({
                        datasetId: ds.id,
                        onSuccess: handleRefreshTestCases,
                        presetId: ds.metadata?.preset,
                      })
                    }
                    onPageChange={(page, pageSize) => setPagination({ current: page, pageSize })}
                    onRefresh={onRefresh}
                    onRun={() =>
                      createRunCreateModal({
                        benchmarkId,
                        datasetId: ds.id,
                        datasetName: ds.name,
                      })
                    }
                    onSearchChange={handleSearchChange}
                  />
                );
              })}
            </Flexbox>
          )}
        </Flexbox>
      </>
    );
  },
);

export default DatasetsTab;
