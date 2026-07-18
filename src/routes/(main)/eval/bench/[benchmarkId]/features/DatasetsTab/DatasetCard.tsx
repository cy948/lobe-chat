import { ActionIcon, Flexbox } from '@lobehub/ui';
import { Button, DropdownMenu } from '@lobehub/ui/base-ui';
import { App, Card } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { ArrowRight, ChevronRight, Ellipsis, Pencil, Play, Trash2 } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { DatasetListItem } from '@/features/EvalDatasets/DatasetListItem';
import TestCaseTable from '@/features/EvalDatasets/TestCaseTable';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { agentEvalService } from '@/services/agentEval';

import TestCaseEmptyState from './TestCaseEmptyState';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    .ant-card-body {
      padding: 0;
    }
  `,
  dropdownButton: css`
    width: 28px;
    height: 28px;
    padding: 0;
    color: ${cssVar.colorTextTertiary};
  `,
  expandedSection: css`
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  footer: css`
    padding: 12px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  footerLink: css`
    text-decoration: none;
  `,
}));

interface DatasetCardProps {
  benchmarkId: string;
  categories?: string[];
  categoryFilter: string;
  dataset: any;
  filteredCases: any[];
  isExpanded: boolean;
  loading: boolean;
  onAddCase: () => void;
  onCategoryFilterChange: (filter: string) => void;
  onDeleteCase: (testCase: any) => void;
  onEdit: (dataset: any) => void;
  onExpand: () => void;
  onImport: () => void;
  onPageChange: (page: number, pageSize: number) => void;
  onRefresh: () => void;
  onRun: () => void;
  onSearchChange: (value: string) => void;
  pagination: { current: number; pageSize: number };
  search: string;
  total: number;
}

const DatasetCard = memo<DatasetCardProps>(
  ({
    benchmarkId,
    categories,
    categoryFilter,
    dataset,
    isExpanded,
    loading,
    total,
    filteredCases,
    search,
    pagination,
    onExpand,
    onEdit,
    onRefresh,
    onSearchChange,
    onCategoryFilterChange,
    onPageChange,
    onAddCase,
    onImport,
    onRun,
  }) => {
    const { t } = useTranslation('eval');
    const { modal, message } = App.useApp();

    const handleDelete = useCallback(() => {
      modal.confirm({
        content: t('dataset.delete.confirm'),
        okButtonProps: { danger: true },
        okText: t('common.delete'),
        onOk: async () => {
          try {
            await agentEvalService.deleteDataset(dataset.id);
            message.success(t('dataset.delete.success'));
            onRefresh();
          } catch {
            message.error(t('dataset.delete.error'));
          }
        },
        title: t('common.delete'),
      });
    }, [dataset.id, message, modal, onRefresh, t]);

    return (
      <Card className={styles.card}>
        <DatasetListItem
          dataset={dataset}
          trailing={
            <>
              <Button
                icon={Play}
                size="small"
                style={{
                  height: 28,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onRun();
                }}
              >
                {t('run.actions.run')}
              </Button>
              <DropdownMenu
                trigger={['click']}
                items={[
                  {
                    icon: <Pencil size={14} />,
                    key: 'edit',
                    label: t('common.edit'),
                    onClick: () => onEdit(dataset),
                  },
                  { type: 'divider' as const },
                  {
                    danger: true,
                    icon: <Trash2 size={14} />,
                    key: 'delete',
                    label: t('common.delete'),
                    onClick: handleDelete,
                  },
                ]}
              >
                <ActionIcon
                  className={styles.dropdownButton}
                  icon={Ellipsis}
                  size="small"
                  onClick={(e) => e.stopPropagation()}
                />
              </DropdownMenu>
              <ChevronRight
                size={16}
                style={{
                  color: 'var(--ant-color-text-tertiary)',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </>
          }
          onClick={onExpand}
        />

        {isExpanded && (
          <div className={styles.expandedSection}>
            {loading ? (
              <Flexbox align="center" justify="center" style={{ padding: '48px 24px' }}>
                <NeuralNetworkLoading size={48} />
              </Flexbox>
            ) : total === 0 ? (
              <TestCaseEmptyState onAddCase={onAddCase} onImport={onImport} />
            ) : (
              <TestCaseTable
                readOnly
                categories={categories}
                categoryFilter={categoryFilter}
                datasetEvalMode={dataset.evalMode}
                pagination={pagination}
                search={search}
                testCases={filteredCases}
                total={total}
                onCategoryFilterChange={onCategoryFilterChange}
                onPageChange={onPageChange}
                onSearchChange={onSearchChange}
              />
            )}
            <Flexbox horizontal align="center" className={styles.footer} justify="center">
              <WorkspaceLink
                className={styles.footerLink}
                to={`/eval/bench/${benchmarkId}/datasets/${dataset.id}`}
              >
                <Button icon={ArrowRight} iconPosition="end" size="small" type="text">
                  {t('dataset.detail.viewDetail')}
                </Button>
              </WorkspaceLink>
            </Flexbox>
          </div>
        )}
      </Card>
    );
  },
);

export default DatasetCard;
