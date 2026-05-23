'use client';

import type { AgentEvalDatasetListItem, AgentEvalRunListItem } from '@lobechat/types';
import { Button, Flexbox } from '@lobehub/ui';
import { App, Card, Empty, Tag, Typography } from 'antd';
import { createStaticStyles } from 'antd-style';
import { ArrowLeft, Plus } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import RunCreateModal from '@/routes/(main)/eval/bench/[benchmarkId]/features/RunCreateModal';
import DatasetCreateModal from '@/routes/(main)/eval/features/DatasetCreateModal';
import { experimentSelectors, useEvalStore } from '@/store/eval';

const styles = createStaticStyles(({ css, cssVar }) => ({
  cardTitle: css`
    font-size: 16px;
    font-weight: 600;
  `,
  container: css`
    overflow-y: auto;
    padding-block: 24px;
    padding-inline: 32px;
  `,
  meta: css`
    font-size: 13px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

const ExperimentDetailPage = memo(() => {
  const { t } = useTranslation('eval');
  const { experimentId } = useParams<{ experimentId: string }>();
  const navigate = useNavigate();
  const { modal } = App.useApp();
  const [createDatasetOpen, setCreateDatasetOpen] = useState(false);
  const [runDatasetId, setRunDatasetId] = useState<string | null>(null);
  const [forkRun, setForkRun] = useState<AgentEvalRunListItem | null>(null);
  const useFetchExperimentDetail = useEvalStore((s) => s.useFetchExperimentDetail);
  const experiment = useEvalStore(experimentSelectors.getExperimentDetailById(experimentId || ''));
  const deleteExperiment = useEvalStore((s) => s.deleteExperiment);

  useFetchExperimentDetail(experimentId);

  const datasets = useMemo<AgentEvalDatasetListItem[]>(
    () => experiment?.datasets || [],
    [experiment],
  );
  const runs = useMemo<AgentEvalRunListItem[]>(() => experiment?.runs || [], [experiment]);
  const datasetMap = useMemo(
    () => new Map(datasets.map((dataset) => [dataset.id, dataset])),
    [datasets],
  );
  const benchmarkOptions = useMemo(
    () =>
      experiment?.benchmarks.map((benchmark) => ({ id: benchmark.id, name: benchmark.name })) || [],
    [experiment],
  );

  if (!experimentId || !experiment) return null;

  return (
    <Flexbox className={styles.container} gap={24} height="100%" width="100%">
      <Link to="/eval/experiments">
        <Flexbox horizontal align="center" gap={4}>
          <ArrowLeft size={16} />
          <span>{t('experiment.detail.backToList')}</span>
        </Flexbox>
      </Link>

      <Flexbox horizontal align="start" justify="space-between">
        <Flexbox gap={6}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {experiment.name}
          </Typography.Title>
          {experiment.description && (
            <Typography.Text type="secondary">{experiment.description}</Typography.Text>
          )}
          <span className={styles.meta}>
            {t('experiment.detail.lastAccessed', {
              time: new Date(experiment.accessedAt).toLocaleString(),
            })}
          </span>
        </Flexbox>
        <Button
          danger
          onClick={() =>
            modal.confirm({
              content: t('experiment.actions.delete.confirm'),
              okButtonProps: { danger: true },
              okText: t('experiment.actions.delete'),
              onOk: async () => {
                await deleteExperiment(experiment.id);
                navigate('/eval/experiments');
              },
              title: t('experiment.actions.delete'),
            })
          }
        >
          {t('experiment.actions.delete')}
        </Button>
      </Flexbox>

      <Card title={<span className={styles.cardTitle}>{t('experiment.detail.benchmarks')}</span>}>
        <Flexbox horizontal gap={8} wrap="wrap">
          {experiment.benchmarks.map((benchmark) => (
            <Tag key={benchmark.id}>{benchmark.name}</Tag>
          ))}
        </Flexbox>
      </Card>

      <Card
        title={<span className={styles.cardTitle}>{t('experiment.detail.datasets')}</span>}
        extra={
          <Button icon={Plus} size="small" onClick={() => setCreateDatasetOpen(true)}>
            {t('dataset.actions.addDataset')}
          </Button>
        }
      >
        <Flexbox gap={12}>
          {datasets.map((dataset) => (
            <Card key={dataset.id} size="small">
              <Flexbox gap={8}>
                <strong>{dataset.name}</strong>
                {dataset.description && (
                  <Typography.Text type="secondary">{dataset.description}</Typography.Text>
                )}
                <Flexbox horizontal gap={8}>
                  <Button size="small" onClick={() => setRunDatasetId(dataset.id)}>
                    {t('dataset.detail.addRun')}
                  </Button>
                  <Link to={`/eval/bench/${dataset.benchmarkId}/datasets/${dataset.id}`}>
                    {t('dataset.detail.viewDetail')}
                  </Link>
                </Flexbox>
              </Flexbox>
            </Card>
          ))}
          {datasets.length === 0 && (
            <Empty
              description={t('dataset.empty.description')}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </Flexbox>
      </Card>

      <Card title={<span className={styles.cardTitle}>{t('experiment.detail.runs')}</span>}>
        <Flexbox gap={12}>
          {runs.map((run) => (
            <Card key={run.id} size="small">
              <Flexbox gap={8}>
                <strong>{run.name || run.id.slice(0, 8)}</strong>
                {run.datasetName && <span className={styles.meta}>{run.datasetName}</span>}
                {run.parentRunId && (
                  <span className={styles.meta}>
                    {t('experiment.run.parent', { name: run.parentRunId })}
                  </span>
                )}
                <Flexbox horizontal gap={8}>
                  <Button size="small" onClick={() => setForkRun(run)}>
                    {t('run.actions.fork')}
                  </Button>
                  <Link
                    to={`/eval/bench/${datasetMap.get(run.datasetId)?.benchmarkId || experiment.benchmarks[0]?.id}/runs/${run.id}`}
                  >
                    {t('dataset.detail.viewDetail')}
                  </Link>
                </Flexbox>
              </Flexbox>
            </Card>
          ))}
          {runs.length === 0 && (
            <Empty description={t('run.empty.description')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Flexbox>
      </Card>

      <DatasetCreateModal
        benchmarkId={benchmarkOptions.length === 1 ? benchmarkOptions[0].id : undefined}
        benchmarkOptions={benchmarkOptions}
        open={createDatasetOpen}
        sourceExperimentId={experiment.id}
        onClose={() => setCreateDatasetOpen(false)}
        onSuccess={() => useEvalStore.getState().refreshExperimentDetail(experiment.id)}
      />

      <RunCreateModal
        benchmarkId={
          datasetMap.get(runDatasetId || '')?.benchmarkId || experiment.benchmarks[0]?.id || ''
        }
        datasetId={runDatasetId || undefined}
        datasetName={datasetMap.get(runDatasetId || '')?.name}
        experimentId={experiment.id}
        open={!!runDatasetId}
        onClose={() => setRunDatasetId(null)}
      />

      <RunCreateModal
        benchmarkId={
          datasetMap.get(forkRun?.datasetId || '')?.benchmarkId ||
          experiment.benchmarks[0]?.id ||
          ''
        }
        datasetId={forkRun?.datasetId}
        datasetName={forkRun?.datasetName}
        experimentId={experiment.id}
        open={!!forkRun}
        parentRunId={forkRun?.id}
        parentRunName={forkRun?.name || undefined}
        onClose={() => setForkRun(null)}
      />
    </Flexbox>
  );
});

export default ExperimentDetailPage;
