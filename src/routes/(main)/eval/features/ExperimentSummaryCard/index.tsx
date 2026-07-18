'use client';

import type { AgentEvalExperimentListItem } from '@lobechat/types';
import { Flexbox, Icon } from '@lobehub/ui';
import { ArrowRight, Beaker, FlaskConical } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import RunRow from '../SummaryCard/RunRow';
import { summaryCardStyles as styles } from '../SummaryCard/sharedStyles';

interface ExperimentSummaryCardProps {
  experiment: AgentEvalExperimentListItem;
}

const ExperimentSummaryCard = memo<ExperimentSummaryCardProps>(({ experiment }) => {
  const { t } = useTranslation('eval');
  const recentRuns = experiment.recentRuns?.slice(0, 3) || [];
  const allRunCount = experiment.runCount || recentRuns.length;
  const hasRuns = allRunCount > 0;

  return (
    <Flexbox className={styles.card} gap={12} justify="space-between">
      <Flexbox gap={16}>
        <Flexbox horizontal justify="space-between">
          <Flexbox horizontal align="start" gap={12}>
            <div className={styles.iconBox}>
              <Icon
                icon={Beaker}
                size={22}
                style={{
                  color: 'var(--ant-color-info)',
                }}
              />
            </div>
            <Flexbox gap={4}>
              <WorkspaceLink className={styles.name} to={`/eval/experiments/${experiment.id}`}>
                {experiment.name}
              </WorkspaceLink>
              <Flexbox horizontal align="center" className={styles.meta} gap={4}>
                <span>
                  {t('experiment.card.benchmarkCount', { count: experiment.benchmarkCount })}
                </span>
                <span>·</span>
                <span>{t('experiment.card.runCount', { count: experiment.runCount })}</span>
              </Flexbox>
            </Flexbox>
          </Flexbox>

          <WorkspaceLink className={styles.detailLink} to={`/eval/experiments/${experiment.id}`}>
            <Icon icon={ArrowRight} size={16} />
          </WorkspaceLink>
        </Flexbox>

        {experiment.description && <p className={styles.description}>{experiment.description}</p>}
      </Flexbox>

      {hasRuns ? (
        <Flexbox gap={8}>
          <Flexbox horizontal align="center" justify="space-between">
            <span className={styles.recentLabel}>{t('benchmark.card.recentRuns')}</span>
            {allRunCount > 3 && (
              <WorkspaceLink className={styles.viewAll} to={`/eval/experiments/${experiment.id}`}>
                {t('benchmark.card.viewAll', { count: allRunCount })}
              </WorkspaceLink>
            )}
          </Flexbox>
          <Flexbox gap={6}>
            {recentRuns.length > 0 ? (
              recentRuns.map((run) => {
                const metrics = run.metrics;
                const agentSnapshot = run.config?.agentSnapshot;
                const passedCases = metrics?.passedCases ?? 0;
                const failedCases = metrics?.failedCases ?? 0;
                const errorCases = metrics?.errorCases ?? 0;

                return (
                  <RunRow
                    agentName={agentSnapshot?.title || undefined}
                    benchmarkId={experiment.benchmarks[0]?.id || ''}
                    cost={metrics?.totalCost}
                    createdAt={String(run.createdAt)}
                    errorCount={errorCases}
                    failCount={failedCases}
                    href={`/eval/experiments/${experiment.id}`}
                    id={run.id}
                    key={run.id}
                    model={agentSnapshot?.model || undefined}
                    name={run.name || undefined}
                    passCount={passedCases}
                    passRate={metrics?.passRate}
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
                  textAlign: 'center',
                  padding: '12px 0',
                }}
              >
                {t('benchmark.card.noRecentRuns')}
              </p>
            )}
          </Flexbox>
        </Flexbox>
      ) : (
        <div className={styles.emptyBox}>
          <Icon
            icon={FlaskConical}
            size={24}
            style={{ color: 'var(--ant-color-text-quaternary)', marginBottom: 8 }}
          />
          <p style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 13, margin: '0 0 4px' }}>
            {t('experiment.card.empty')}
          </p>
          <p
            style={{
              color: 'var(--ant-color-text-quaternary)',
              fontSize: 12,
              margin: 0,
            }}
          >
            {t('experiment.card.emptyHint')}
          </p>
        </div>
      )}
    </Flexbox>
  );
});

export default ExperimentSummaryCard;
