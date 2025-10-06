'use client';

import { useTheme } from 'antd-style';
import dayjs from 'dayjs';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Statistic from '@/components/Statistic';
import StatisticCard from '@/components/StatisticCard';
import TitleWithPercentage from '@/components/StatisticCard/TitleWithPercentage';
import { UsageLog } from '@/types/usage/usageRecord';
import { formatNumber } from '@/utils/format';

import { UsageChartProps } from '../../Client';

const computeSpend = (
  data: UsageLog[],
): {
  today: number | string;
  yesterday: number | string;
} => {
  if (!data || data.length === 0) return { today: 0, yesterday: 0 };

  const today = data.find((log) => dayjs(log.day).isToday())?.totalSpend ?? 0;
  const yesterday = data.find((log) => dayjs(log.day).isYesterday())?.totalSpend ?? 0;

  return {
    today: formatNumber(today),
    yesterday: formatNumber(yesterday),
  };
};

const TodaySpend = memo<UsageChartProps>(({ data, isLoading }) => {
  const { t } = useTranslation('auth');
  const theme = useTheme();

  const { today, yesterday } = computeSpend(data || []);

  return (
    <StatisticCard
      highlight={theme.green}
      loading={isLoading}
      statistic={{
        description: <Statistic title={t('usage.cards.today.yesterday')} value={yesterday} />,
        precision: 2,
        prefix: '$',
        value: today,
      }}
      title={
        <TitleWithPercentage
          count={typeof today === 'number' ? today : 0}
          prvCount={typeof yesterday === 'number' ? yesterday : 0}
          title={t('usage.cards.today.title')}
        />
      }
    />
  );
});

export default TodaySpend;
