'use client';

import { useTheme } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Statistic from '@/components/Statistic';
import StatisticCard from '@/components/StatisticCard';
import TitleWithPercentage from '@/components/StatisticCard/TitleWithPercentage';
import { UsageLog } from '@/types/usage/usageRecord';
import { formatNumber } from '@/utils/format';

import { UsageChartProps } from '../../Client';

const computeMonth = (
  data: UsageLog[],
): {
  calls: number | string;
  spend: number | string;
} => {
  if (!data || data.length === 0) return { calls: 0, spend: 0 };

  const spend = data.reduce((acc, log) => acc + (log.totalSpend || 0), 0);
  const calls = data.reduce((acc, log) => acc + (log.records.length || 0), 0);

  return {
    calls: formatNumber(calls),
    spend: formatNumber(spend),
  };
};

const MonthSpend = memo<UsageChartProps>(({ data, isLoading }) => {
  const { t } = useTranslation('auth');
  const theme = useTheme();

  const { spend, calls } = computeMonth(data || []);

  return (
    <StatisticCard
      highlight={theme.blue}
      loading={isLoading}
      statistic={{
        description: <Statistic title={t('usage.cards.month.modelCalls')} value={calls} />,
        precision: 2,
        prefix: '$',
        value: spend,
      }}
      title={<TitleWithPercentage title={t('usage.cards.month.title')} />}
    />
  );
});

export default MonthSpend;
