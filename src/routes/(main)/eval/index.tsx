'use client';

import { Empty, Flexbox, Skeleton, Text } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Beaker, FlaskConical, Plus } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { createExperimentModal } from '@/features/EvalExperiments';
import { experimentSelectors, useEvalStore } from '@/store/eval';

import BenchmarkCard from './features/BenchmarkCard';
import { createCreateBenchmarkModal } from './features/CreateBenchmarkModal';
import ExperimentSummaryCard from './features/ExperimentSummaryCard';

const styles = createStaticStyles(({ css }) => ({
  cardGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
    gap: 20px;
  `,
  container: css`
    overflow-y: auto;
    padding-block: 24px;
    padding-inline: 32px;
  `,
  sectionHeader: css`
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  sectionSubtitle: css`
    margin: 0;
    font-size: 13px;
    color: ${cssVar.colorTextTertiary};
  `,
  sectionsGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;

    @media (width <= 1200px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  sectionWrap: css`
    min-width: 0;
  `,
  skeletonCard: css`
    padding: 20px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  title: css`
    margin: 0;
    line-height: 1.3;
  `,
}));

const SkeletonGrid = memo(() => (
  <div className={styles.cardGrid}>
    {[0, 1].map((i) => (
      <Flexbox className={styles.skeletonCard} gap={16} key={i}>
        <Flexbox horizontal gap={12}>
          <Skeleton.Avatar active shape="square" size={36} />
          <Flexbox flex={1} gap={8}>
            <Skeleton.Button active size="small" style={{ height: 14, width: 160 }} />
            <Skeleton.Button active size="small" style={{ height: 12, width: 220 }} />
          </Flexbox>
        </Flexbox>
        <Skeleton.Button active block size="small" style={{ height: 64 }} />
      </Flexbox>
    ))}
  </div>
));

const EvalOverview = memo(() => {
  const { t } = useTranslation('eval');
  const benchmarkList = useEvalStore((s) => s.benchmarkList);
  const experiments = useEvalStore(experimentSelectors.experimentList);
  const useFetchBenchmarks = useEvalStore((s) => s.useFetchBenchmarks);
  const useFetchExperiments = useEvalStore((s) => s.useFetchExperiments);
  const benchmarksQuery = useFetchBenchmarks();
  const experimentsQuery = useFetchExperiments();

  return (
    <Flexbox className={styles.container} gap={32} height="100%" width="100%">
      <Flexbox horizontal align="center" gap={16} justify="space-between">
        <Flexbox gap={4} style={{ minWidth: 0 }}>
          <Text ellipsis as="h1" className={styles.title} fontSize={30} weight={600}>
            {t('overview.title')}
          </Text>
          <Text type="secondary">{t('overview.subtitle')}</Text>
        </Flexbox>
      </Flexbox>

      <div className={styles.sectionsGrid}>
        <Flexbox className={styles.sectionWrap} gap={16}>
          <Flexbox horizontal align="center" justify="space-between">
            <Flexbox gap={4}>
              <h2 className={styles.sectionHeader}>{t('overview.sections.benchmarks.title')}</h2>
              <p className={styles.sectionSubtitle}>{t('overview.sections.benchmarks.subtitle')}</p>
            </Flexbox>
            <Button icon={Plus} type="primary" onClick={createCreateBenchmarkModal}>
              {t('overview.createBenchmark')}
            </Button>
          </Flexbox>

          <AsyncBoundary
            data={benchmarksQuery.data}
            empty={<Empty description={t('benchmark.empty')} icon={FlaskConical} />}
            error={benchmarksQuery.error}
            errorVariant="block"
            isEmpty={benchmarkList.length === 0}
            isLoading={benchmarksQuery.isLoading}
            loading={<SkeletonGrid />}
            onRetry={() => benchmarksQuery.mutate()}
          >
            <div className={styles.cardGrid}>
              {benchmarkList.map((benchmark: any) => (
                <BenchmarkCard
                  bestScore={benchmark.bestScore}
                  datasetCount={benchmark.datasetCount}
                  description={benchmark.description}
                  id={benchmark.id}
                  key={benchmark.id}
                  name={benchmark.name}
                  recentRuns={benchmark.recentRuns}
                  runCount={benchmark.runCount}
                  source={benchmark.source}
                  tags={benchmark.tags}
                  testCaseCount={benchmark.testCaseCount}
                />
              ))}
            </div>
          </AsyncBoundary>
        </Flexbox>

        <Flexbox className={styles.sectionWrap} gap={16}>
          <Flexbox horizontal align="center" justify="space-between">
            <Flexbox gap={4}>
              <h2 className={styles.sectionHeader}>{t('overview.sections.experiments.title')}</h2>
              <p className={styles.sectionSubtitle}>
                {t('overview.sections.experiments.subtitle')}
              </p>
            </Flexbox>
            <Button icon={Plus} type="primary" onClick={() => createExperimentModal()}>
              {t('overview.createExperiment')}
            </Button>
          </Flexbox>

          <AsyncBoundary
            data={experimentsQuery.data}
            empty={<Empty description={t('experiment.overview.emptyHint')} icon={Beaker} />}
            error={experimentsQuery.error}
            errorVariant="block"
            isEmpty={experiments.length === 0}
            isLoading={experimentsQuery.isLoading}
            loading={<SkeletonGrid />}
            onRetry={() => experimentsQuery.mutate()}
          >
            <div className={styles.cardGrid}>
              {experiments.map((experiment) => (
                <ExperimentSummaryCard experiment={experiment} key={experiment.id} />
              ))}
            </div>
          </AsyncBoundary>
        </Flexbox>
      </div>
    </Flexbox>
  );
});

export default EvalOverview;
