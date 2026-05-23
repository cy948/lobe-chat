'use client';

import { Button, Empty, Flexbox } from '@lobehub/ui';
import { Card } from 'antd';
import { createStaticStyles } from 'antd-style';
import { Beaker, Plus } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { experimentSelectors, useEvalStore } from '@/store/eval';

import ExperimentCreateModal from './ExperimentCreateModal';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    text-decoration: none;

    .ant-card-body {
      padding: 18px;
    }
  `,
  container: css`
    overflow-y: auto;
    padding-block: 24px;
    padding-inline: 32px;
  `,
  count: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  description: css`
    margin: 0;
    font-size: 13px;
    color: ${cssVar.colorTextTertiary};
  `,
  subtitle: css`
    margin: 0;
    font-size: 13px;
    color: ${cssVar.colorTextTertiary};
  `,
  title: css`
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
}));

const ExperimentListPage = memo(() => {
  const { t } = useTranslation('eval');
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const useFetchExperiments = useEvalStore((s) => s.useFetchExperiments);
  const experiments = useEvalStore(experimentSelectors.experimentList);
  const { isLoading } = useFetchExperiments();

  return (
    <Flexbox className={styles.container} gap={24} height="100%" width="100%">
      <Flexbox horizontal align="center" justify="space-between">
        <Flexbox gap={4}>
          <h1 className={styles.title}>{t('experiment.list.title')}</h1>
          <p className={styles.subtitle}>{t('experiment.list.subtitle')}</p>
        </Flexbox>
        <Button icon={Plus} type="primary" onClick={() => setCreateOpen(true)}>
          {t('experiment.actions.create')}
        </Button>
      </Flexbox>

      {isLoading ? null : experiments.length === 0 ? (
        <Flexbox align="center" flex={1} justify="center">
          <Empty description={t('experiment.card.emptyHint')} icon={Beaker}>
            <Button icon={Plus} type="primary" onClick={() => setCreateOpen(true)}>
              {t('experiment.actions.create')}
            </Button>
          </Empty>
        </Flexbox>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          }}
        >
          {experiments.map((experiment) => (
            <Link
              className={styles.card}
              key={experiment.id}
              to={`/eval/experiments/${experiment.id}`}
            >
              <Card hoverable>
                <Flexbox gap={8}>
                  <Flexbox gap={2}>
                    <strong>{experiment.name}</strong>
                    {experiment.description && (
                      <p className={styles.description}>{experiment.description}</p>
                    )}
                  </Flexbox>
                  <Flexbox horizontal gap={8} wrap="wrap">
                    <span className={styles.count}>
                      {t('experiment.card.benchmarkCount', { count: experiment.benchmarkCount })}
                    </span>
                    <span className={styles.count}>
                      {t('experiment.card.datasetCount', { count: experiment.datasetCount })}
                    </span>
                    <span className={styles.count}>
                      {t('experiment.card.runCount', { count: experiment.runCount })}
                    </span>
                  </Flexbox>
                </Flexbox>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <ExperimentCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(id) => navigate(`/eval/experiments/${id}`)}
      />
    </Flexbox>
  );
});

export default ExperimentListPage;
