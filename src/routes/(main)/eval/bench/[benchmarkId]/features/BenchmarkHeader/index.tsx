'use client';

import type {
  AgentEvalBenchmark,
  AgentEvalDatasetListItem,
  AgentEvalRunListItem,
} from '@lobechat/types';
import { formatCost } from '@lobechat/utils';
import { Flexbox, Icon, Text } from '@lobehub/ui';
import { Button, confirmModal, type DropdownItem, DropdownMenu } from '@lobehub/ui/base-ui';
import { Badge } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  CircleDollarSign,
  Clock,
  Edit,
  EllipsisVertical,
  Layers,
  Server,
  Trash2,
  Trophy,
  User,
  type LucideIcon,
} from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { EvalStatCard, formatDuration, formatDurationMinutes } from '@/features/EvalCommon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useEvalStore } from '@/store/eval';

import { createBenchmarkEditModal } from '../../../../features/BenchmarkEditModal';
import Sparkline from '../../../../features/Sparkline';

const RANK_COLORS = [cssVar.colorPrimary, cssVar.colorSuccess, cssVar.colorTextQuaternary];

const styles = createStaticStyles(({ css, cssVar }) => ({
  heroBand: css`
    padding: 20px;
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillQuaternary};
  `,
  heroValue: css`
    font-family: ${cssVar.fontFamilyCode};
    font-size: ${cssVar.fontSizeHeading1};
    font-weight: 600;
    line-height: 1;
    color: ${cssVar.colorText};
  `,
  description: css`
    margin: 0;
    margin-block-start: 2px;
    font-size: ${cssVar.fontSize};
    color: ${cssVar.colorTextTertiary};
  `,
  iconBox: css`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 40px;
    height: 40px;
    border-radius: ${cssVar.borderRadiusLG};
  `,
  title: css`
    margin: 0;
    font-size: ${cssVar.fontSizeHeading3};
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
}));

interface BenchmarkHeaderProps {
  benchmark: AgentEvalBenchmark;
  completedRuns: AgentEvalRunListItem[];
  datasets: AgentEvalDatasetListItem[];
  onBenchmarkUpdate?: (benchmark: AgentEvalBenchmark) => void;
  runCount: number;
  systemIcon?: LucideIcon;
  totalCases: number;
}

const BenchmarkHeader = memo<BenchmarkHeaderProps>(
  ({
    benchmark,
    completedRuns,
    datasets,
    onBenchmarkUpdate,
    runCount,
    systemIcon = Server,
    totalCases,
  }) => {
    const { t } = useTranslation('eval');
    const navigate = useWorkspaceAwareNavigate();
    const deleteBenchmark = useEvalStore((s) => s.deleteBenchmark);
    const refreshBenchmarkDetail = useEvalStore((s) => s.refreshBenchmarkDetail);
    const isUserBenchmark = !benchmark.isSystem;

    const handleEditSuccess = async () => {
      await refreshBenchmarkDetail(benchmark.id);
      onBenchmarkUpdate?.(benchmark);
    };

    const handleEdit = () => createBenchmarkEditModal({ benchmark, onSuccess: handleEditSuccess });

    const handleDelete = () => {
      confirmModal({
        content: t('benchmark.actions.delete.confirm'),
        okButtonProps: { danger: true },
        okText: t('benchmark.actions.delete'),
        onOk: async () => {
          await deleteBenchmark(benchmark.id);
          navigate('/eval');
        },
        title: t('benchmark.actions.delete'),
      });
    };

    const menuItems: DropdownItem[] = [
      {
        danger: true,
        icon: <Trash2 size={16} />,
        key: 'delete',
        label: t('common.delete'),
        onClick: handleDelete,
      },
    ];

    // === Stats Computations ===

    const hasDatasets = datasets.length > 0;
    const hasCompletedRuns = completedRuns.length > 0;

    // Top Agents: group by targetAgent, compute avg passRate, sort desc, take top 3
    const topAgents = useMemo(() => {
      if (!hasCompletedRuns) return [];
      const agentMap = new Map<string, { name: string; passRates: number[] }>();
      for (const run of completedRuns) {
        const agentName = run.targetAgent?.title || run.targetAgent?.id || t('common.unknown');
        const agentId = run.targetAgentId || run.targetAgent?.id || agentName;
        if (!agentMap.has(agentId)) {
          agentMap.set(agentId, { name: agentName, passRates: [] });
        }
        agentMap.get(agentId)!.passRates.push(run.passRate ?? run.metrics?.passRate ?? 0);
      }
      return [...agentMap.entries()]
        .map(([, v]) => ({
          avgPassRate: v.passRates.reduce((a, b) => a + b, 0) / v.passRates.length,
          name: v.name,
        }))
        .sort((a, b) => b.avgPassRate - a.avgPassRate)
        .slice(0, 3);
    }, [completedRuns, hasCompletedRuns]);

    // Best agent for the summary line
    const bestAgent = topAgents.length > 0 ? topAgents[0] : null;

    // Pass-rate trend across completed runs (reversed to read oldest→newest) for
    // the hero sparkline; the best rate anchors the headline number.
    const passRateTrend = useMemo(() => {
      const rates = completedRuns
        .map((r) => r.passRate ?? r.metrics?.passRate)
        .filter((v): v is number => typeof v === 'number');
      return rates.reverse();
    }, [completedRuns]);
    const bestPassRate = passRateTrend.length > 0 ? Math.max(...passRateTrend) : undefined;

    // Avg Duration
    const avgDuration = useMemo(() => {
      if (!hasCompletedRuns) return null;
      const durations = completedRuns
        .map((r) => r.metrics?.duration ?? r.totalDuration)
        .filter((d): d is number => d != null && d > 0);
      if (durations.length === 0) return null;
      return durations.reduce((a, b) => a + b, 0) / durations.length;
    }, [completedRuns, hasCompletedRuns]);

    // P99 Duration
    const p99Duration = useMemo(() => {
      if (!hasCompletedRuns) return null;
      const durations = completedRuns
        .map((r) => r.metrics?.duration ?? r.totalDuration)
        .filter((d): d is number => d != null && d > 0)
        .sort((a, b) => a - b);
      if (durations.length === 0) return null;
      const idx = Math.ceil(durations.length * 0.99) - 1;
      return durations[idx];
    }, [completedRuns, hasCompletedRuns]);

    // Avg Cost
    const avgCost = useMemo(() => {
      if (!hasCompletedRuns) return null;
      const costs = completedRuns
        .map((r) => r.metrics?.totalCost ?? r.totalCost)
        .filter((c): c is number => c != null && c > 0);
      if (costs.length === 0) return null;
      return costs.reduce((a, b) => a + b, 0) / costs.length;
    }, [completedRuns, hasCompletedRuns]);

    return (
      <>
        {/* Header */}
        <Flexbox gap={16}>
          <Flexbox horizontal align="start" justify="space-between">
            <Flexbox horizontal align="start" gap={12}>
              <div
                className={styles.iconBox}
                style={{
                  background: isUserBenchmark ? cssVar.colorSuccessBg : cssVar.colorPrimaryBg,
                }}
              >
                <Icon
                  icon={isUserBenchmark ? User : systemIcon}
                  size={20}
                  style={{
                    color: isUserBenchmark ? cssVar.colorSuccess : cssVar.colorPrimary,
                  }}
                />
              </div>
              <Flexbox gap={4}>
                <h1 className={styles.title}>{benchmark.name}</h1>
                {benchmark.description && (
                  <p className={styles.description}>{benchmark.description}</p>
                )}
              </Flexbox>
            </Flexbox>

            <Flexbox horizontal gap={8}>
              <Button icon={Edit} size="small" onClick={handleEdit}>
                {t('common.edit')}
              </Button>
              <DropdownMenu items={menuItems} placement="bottomRight">
                <Button icon={EllipsisVertical} size="small" />
              </DropdownMenu>
            </Flexbox>
          </Flexbox>
        </Flexbox>

        {/* Results hero — headline best pass rate + trend across completed runs.
            Always rendered (shows a muted dash before the first completed run) so
            the benchmark always leads with its outcome. */}
        <Flexbox
          horizontal
          align={'center'}
          className={styles.heroBand}
          gap={16}
          justify={'space-between'}
        >
          <Flexbox gap={6}>
            <span className={styles.heroValue}>
              {bestPassRate !== undefined ? `${(bestPassRate * 100).toFixed(0)}%` : '—'}
            </span>
            <Text color={cssVar.colorTextSecondary} fontSize={14}>
              {bestAgent
                ? t('benchmark.detail.stats.bestPerformance', {
                    agent: bestAgent.name,
                    passRate: (bestAgent.avgPassRate * 100).toFixed(1),
                  })
                : t('benchmark.card.bestPassRate')}
            </Text>
          </Flexbox>
          {passRateTrend.length > 1 && <Sparkline values={passRateTrend} width={220} />}
        </Flexbox>

        {/* Stats Cards */}
        <Flexbox horizontal gap={12}>
          <EvalStatCard
            icon={Trophy}
            iconBackground={cssVar.colorWarningBg}
            iconColor={cssVar.colorWarning}
            label={t('benchmark.detail.stats.topAgents')}
          >
            <>
              {!hasDatasets && !hasCompletedRuns && (
                <span
                  style={{
                    color: cssVar.colorTextQuaternary,
                    fontSize: cssVar.fontSizeXL,
                    fontWeight: 600,
                  }}
                >
                  --
                </span>
              )}

              {hasDatasets && !hasCompletedRuns && (
                <Flexbox gap={2}>
                  <span
                    style={{
                      color: cssVar.colorTextQuaternary,
                      fontSize: cssVar.fontSizeXL,
                      fontWeight: 600,
                    }}
                  >
                    {t('benchmark.detail.stats.waiting')}
                  </span>
                  <span style={{ color: cssVar.colorTextQuaternary, fontSize: cssVar.fontSizeSM }}>
                    {t('benchmark.detail.stats.noEvalRecord')}
                  </span>
                </Flexbox>
              )}

              {hasCompletedRuns && topAgents.length > 0 && (
                <Flexbox gap={6}>
                  {topAgents.map((agent, idx) => (
                    <Flexbox horizontal align="center" justify="space-between" key={agent.name}>
                      <Flexbox horizontal align="center" gap={8}>
                        <span
                          style={{
                            color: RANK_COLORS[idx] || RANK_COLORS[2],
                            fontFamily: cssVar.fontFamilyCode,
                            fontSize: cssVar.fontSizeSM,
                            fontWeight: 600,
                            minWidth: 14,
                            textAlign: 'center',
                          }}
                        >
                          {idx + 1}
                        </span>
                        <span
                          style={{
                            color: cssVar.colorText,
                            fontSize: cssVar.fontSize,
                            fontWeight: 500,
                          }}
                        >
                          {agent.name}
                        </span>
                      </Flexbox>
                      <span
                        style={{
                          color: cssVar.colorTextSecondary,
                          fontFamily: cssVar.fontFamilyCode,
                          fontSize: cssVar.fontSize,
                        }}
                      >
                        {(agent.avgPassRate * 100).toFixed(1)}%
                      </span>
                    </Flexbox>
                  ))}
                </Flexbox>
              )}
            </>
          </EvalStatCard>

          <EvalStatCard
            icon={Layers}
            iconBackground={cssVar.colorPrimaryBg}
            iconColor={cssVar.colorPrimary}
            label={t('benchmark.detail.stats.dataScale')}
            uppercaseLabel={false}
            extra={
              totalCases === 0 ? (
                <Badge
                  count={t('benchmark.detail.stats.needSetup')}
                  style={{
                    backgroundColor: cssVar.colorWarningBg,
                    color: cssVar.colorWarning,
                    fontSize: 11,
                  }}
                />
              ) : undefined
            }
          >
            <Flexbox gap={2}>
              <Flexbox horizontal align="baseline" gap={4}>
                <span
                  style={{
                    color: cssVar.colorText,
                    fontSize: 24,
                    fontWeight: 'bold',
                  }}
                >
                  {totalCases}
                </span>
                {totalCases > 0 && (
                  <span style={{ color: cssVar.colorTextTertiary, fontSize: 13 }}>
                    {t('benchmark.detail.stats.cases')}
                  </span>
                )}
              </Flexbox>
              {totalCases === 0 ? (
                <span style={{ color: cssVar.colorPrimary, fontSize: 12 }}>
                  {t('benchmark.detail.stats.addFirstDataset')}
                </span>
              ) : (
                <span style={{ color: cssVar.colorTextQuaternary, fontSize: 12 }}>
                  {t('benchmark.detail.stats.datasets', { count: datasets.length })}
                </span>
              )}
            </Flexbox>
          </EvalStatCard>

          <EvalStatCard
            icon={Clock}
            iconBackground={cssVar.colorInfoBg}
            iconColor={cssVar.colorInfo}
            label={t('benchmark.detail.stats.avgDuration')}
            uppercaseLabel={false}
          >
            {avgDuration == null ? (
              <span
                style={{
                  color: cssVar.colorTextQuaternary,
                  fontSize: 20,
                  fontWeight: 'bold',
                }}
              >
                --
              </span>
            ) : (
              <Flexbox gap={2}>
                <Flexbox horizontal align="baseline" gap={4}>
                  <span
                    style={{
                      color: cssVar.colorText,
                      fontFamily: cssVar.fontFamilyCode,
                      fontSize: cssVar.fontSizeHeading3,
                      fontWeight: 600,
                    }}
                  >
                    {formatDurationMinutes(avgDuration)}
                  </span>
                  <span style={{ color: cssVar.colorTextTertiary, fontSize: 13 }}>min</span>
                </Flexbox>
                {p99Duration != null && (
                  <span style={{ color: cssVar.colorTextQuaternary, fontSize: 12 }}>
                    {t('benchmark.detail.stats.p99Duration', {
                      duration: formatDuration(p99Duration),
                    })}
                  </span>
                )}
              </Flexbox>
            )}
          </EvalStatCard>

          <EvalStatCard
            icon={CircleDollarSign}
            iconBackground={cssVar.colorSuccessBg}
            iconColor={cssVar.colorSuccess}
            label={t('benchmark.detail.stats.avgCost')}
            uppercaseLabel={false}
          >
            {avgCost == null ? (
              <span
                style={{
                  color: cssVar.colorTextQuaternary,
                  fontSize: 20,
                  fontWeight: 'bold',
                }}
              >
                --
              </span>
            ) : (
              <Flexbox gap={2}>
                <Flexbox horizontal align="baseline" gap={4}>
                  <span
                    style={{
                      color: cssVar.colorText,
                      fontSize: 24,
                      fontWeight: 'bold',
                    }}
                  >
                    ${formatCost(avgCost)}
                  </span>
                  <span style={{ color: cssVar.colorTextTertiary, fontSize: 13 }}>
                    {t('benchmark.detail.stats.perRun')}
                  </span>
                </Flexbox>
                <span style={{ color: cssVar.colorTextQuaternary, fontSize: 12 }}>
                  {t('benchmark.detail.stats.basedOnLastNRuns', {
                    count: completedRuns.length,
                  })}
                </span>
              </Flexbox>
            )}
          </EvalStatCard>
        </Flexbox>
      </>
    );
  },
);

export default BenchmarkHeader;
