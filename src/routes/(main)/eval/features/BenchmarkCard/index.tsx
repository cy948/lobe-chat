'use client';

import { Flexbox, Icon, Tag } from '@lobehub/ui';
import {
  Activity,
  ArrowRight,
  Award,
  BarChart3,
  Database,
  FlaskConical,
  Gauge,
  LoaderPinwheel,
  Server,
  Target,
  TrendingUp,
  Trophy,
  User,
  Volleyball,
  Zap,
} from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import RunRow from '../SummaryCard/RunRow';
import { summaryCardStyles as styles } from '../SummaryCard/sharedStyles';

const SYSTEM_ICONS = [
  LoaderPinwheel,
  Volleyball,
  Server,
  Target,
  Award,
  Trophy,
  Activity,
  BarChart3,
  TrendingUp,
  Gauge,
  Zap,
];

const getSystemIcon = (id: string) => {
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return SYSTEM_ICONS[hash % SYSTEM_ICONS.length];
};

interface BenchmarkCardProps {
  bestScore?: number;
  datasetCount?: number;
  description?: string;
  id: string;
  name: string;
  recentRuns?: any[];
  runCount?: number;
  source?: 'system' | 'user';
  tags?: string[];
  testCaseCount?: number;
}

const BenchmarkCard = memo<BenchmarkCardProps>(
  ({
    id,
    name,
    description,
    testCaseCount,
    recentRuns,
    runCount = 0,
    bestScore,
    source,
    tags,
    datasetCount = 0,
  }) => {
    const { t } = useTranslation('eval');
    const allRunCount = runCount || recentRuns?.length || 0;
    const displayRuns = recentRuns?.slice(0, 3) || [];
    const hasDatasets = datasetCount > 0;
    const systemIcon = useMemo(() => getSystemIcon(id), [id]);

    return (
      <Flexbox className={styles.card} gap={12} justify="space-between">
        <Flexbox gap={16}>
          <Flexbox horizontal justify="space-between">
            <Flexbox horizontal align="start" gap={12}>
              <div
                className={styles.iconBox}
                style={{
                  background:
                    source === 'user'
                      ? 'var(--ant-color-success-bg)'
                      : 'var(--ant-color-primary-bg)',
                }}
              >
                <Icon
                  icon={source === 'user' ? User : systemIcon}
                  size={24}
                  style={{
                    color:
                      source === 'user' ? 'var(--ant-color-success)' : 'var(--ant-color-primary)',
                  }}
                />
              </div>
              <Flexbox gap={4}>
                <WorkspaceLink className={styles.name} to={`/eval/bench/${id}`}>
                  {name}
                </WorkspaceLink>
                <Flexbox horizontal align="center" className={styles.meta} gap={4}>
                  <span>{t('benchmark.card.datasetCount', { count: datasetCount })}</span>
                  <span>·</span>
                  <span>{t('benchmark.card.caseCount', { count: testCaseCount || 0 })}</span>
                  <span>·</span>
                  <span>{t('benchmark.card.runCount', { count: allRunCount })}</span>
                  {bestScore !== undefined && (
                    <>
                      <span>·</span>
                      <span>
                        {t('benchmark.card.bestScore')}{' '}
                        <span
                          style={{
                            color: 'var(--ant-color-text)',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                          }}
                        >
                          {bestScore.toFixed(1)}
                        </span>
                      </span>
                    </>
                  )}
                </Flexbox>
              </Flexbox>
            </Flexbox>

            <WorkspaceLink className={styles.detailLink} to={`/eval/bench/${id}`}>
              <Icon icon={ArrowRight} size={16} />
            </WorkspaceLink>
          </Flexbox>

          {description && <p className={styles.description}>{description}</p>}

          {tags && tags.length > 0 && (
            <Flexbox horizontal gap={4} style={{ flexWrap: 'wrap' }}>
              {tags.slice(0, 4).map((tag) => (
                <Tag key={tag} style={{ fontSize: 10 }}>
                  {tag}
                </Tag>
              ))}
              {tags.length > 4 && <Tag style={{ fontSize: 10 }}>+{tags.length - 4}</Tag>}
            </Flexbox>
          )}
        </Flexbox>

        {!hasDatasets ? (
          <div className={styles.emptyBox}>
            <Icon
              icon={Database}
              size={24}
              style={{ color: 'var(--ant-color-text-quaternary)', marginBottom: 8 }}
            />
            <p style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 13, margin: '0 0 4px' }}>
              {t('benchmark.card.noDataset')}
            </p>
            <p style={{ color: 'var(--ant-color-text-quaternary)', fontSize: 12, margin: 0 }}>
              {t('benchmark.card.noDatasetHint')}
            </p>
          </div>
        ) : (
          <Flexbox gap={8}>
            <Flexbox horizontal align="center" justify="space-between">
              <span className={styles.recentLabel}>{t('benchmark.card.recentRuns')}</span>
              {allRunCount > 3 && (
                <WorkspaceLink className={styles.viewAll} to={`/eval/bench/${id}`}>
                  {t('benchmark.card.viewAll', { count: allRunCount })}
                </WorkspaceLink>
              )}
            </Flexbox>

            {allRunCount > 0 ? (
              <Flexbox gap={6}>
                {displayRuns.length > 0 ? (
                  displayRuns.map((run: any) => {
                    const metrics = run.metrics;
                    const agentSnapshot = run.config?.agentSnapshot;
                    const passedCases = metrics?.passedCases ?? 0;
                    const failedCases = metrics?.failedCases ?? 0;
                    const errorCases = metrics?.errorCases ?? 0;

                    return (
                      <RunRow
                        agentName={agentSnapshot?.title}
                        benchmarkId={id}
                        cost={metrics?.totalCost}
                        createdAt={run.createdAt}
                        errorCount={errorCases}
                        failCount={failedCases}
                        id={run.id}
                        key={run.id}
                        model={agentSnapshot?.model}
                        name={run.name}
                        passCount={passedCases}
                        passRate={metrics?.passRate}
                        score={metrics?.averageScore}
                        status={run.status}
                        totalCases={metrics?.totalCases ?? 0}
                        completedCases={
                          metrics?.completedCases ?? passedCases + failedCases + errorCases
                        }
                      />
                    );
                  })
                ) : (
                  <p
                    style={{
                      color: 'var(--ant-color-text-tertiary)',
                      fontSize: 12,
                      padding: '12px 0',
                      textAlign: 'center',
                    }}
                  >
                    {t('benchmark.card.noRecentRuns')}
                  </p>
                )}
              </Flexbox>
            ) : (
              <div className={styles.emptyBox}>
                <Icon
                  icon={FlaskConical}
                  size={24}
                  style={{ color: 'var(--ant-color-text-quaternary)', marginBottom: 8 }}
                />
                <p
                  style={{
                    color: 'var(--ant-color-text-tertiary)',
                    fontSize: 13,
                    margin: '0 0 4px',
                  }}
                >
                  {t('benchmark.card.empty')}
                </p>
                <p style={{ color: 'var(--ant-color-text-quaternary)', fontSize: 12, margin: 0 }}>
                  {t('benchmark.card.emptyHint')}
                </p>
              </div>
            )}
          </Flexbox>
        )}
      </Flexbox>
    );
  },
);

export default BenchmarkCard;
