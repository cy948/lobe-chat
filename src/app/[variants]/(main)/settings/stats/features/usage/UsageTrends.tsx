import { type BarChartProps } from '@lobehub/charts';
import { Segmented, Skeleton } from '@lobehub/ui';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type UsageLog } from '@/types/usage/usageRecord';

import { GroupBy, type UsageChartProps } from '../../types';
import StatsFormGroup from '../components/StatsFormGroup';
import { UsageBarChart } from '../components/UsageBarChart';

const groupByType = (
  data: UsageLog[],
  type: 'spend' | 'token',
  groupBy: GroupBy,
): { categories: string[]; data: BarChartProps['data'] } => {
  if (!data || data?.length === 0) return { categories: [], data: [] };
  let formattedData: BarChartProps['data'] = [];
  let cate: Map<string, number> = data.reduce((acc, log) => {
    if (log.records) {
      for (const item of log.records) {
        if (groupBy === GroupBy.Model && item.model) {
          acc.set(item.model, 0);
        } else if (groupBy === GroupBy.Provider && item.provider) {
          acc.set(item.provider, 0);
        }
      }
    }
    return acc;
  }, new Map<string, number>());
  const categories: string[] = Array.from(cate.keys());
  formattedData = data.map((log) => {
    const rawTotalValue =
      type === 'spend' ? Number(log.totalSpend ?? 0) : Number(log.totalTokens ?? 0);
    const totalValue = Number.isFinite(rawTotalValue) ? rawTotalValue : 0;
    const totalObj = {
      day: log.day,
      total: type === 'spend' ? Number(totalValue.toFixed(6)) : totalValue,
    };
    let todayCate = new Map<string, number>(cate);
    for (const item of log.records) {
      const rawValue = type === 'spend' ? Number(item.spend ?? 0) : Number(item.totalTokens ?? 0);
      const value = Number.isFinite(rawValue) ? rawValue : 0;
      const key = groupBy === GroupBy.Model ? item.model : item.provider;
      if (!key) continue;
      const prevValue = Number.isFinite(todayCate.get(key)) ? Number(todayCate.get(key)) : 0;
      const displayValue = prevValue + value;
      const nextValue = Number.isFinite(displayValue) ? displayValue : 0;

      todayCate.set(key, type === 'spend' ? Number(nextValue.toFixed(6)) : nextValue);
    }
    return {
      ...totalObj,
      ...Object.fromEntries(todayCate.entries()),
    };
  });
  return {
    categories,
    data: formattedData,
  };
};

enum ShowType {
  Spend = 'spend',
  Token = 'token',
}

const UsageTrends = memo<UsageChartProps>(({ isLoading, data, groupBy }) => {
  const { t } = useTranslation('auth');

  const [type, setType] = useState<ShowType>(ShowType.Spend);

  const { categories: spendCate, data: spendData } = groupByType(
    data || [],
    'spend',
    groupBy || GroupBy.Model,
  );
  const { categories: tokenCate, data: tokenData } = groupByType(
    data || [],
    'token',
    groupBy || GroupBy.Model,
  );

  const charts =
    data &&
    (type === ShowType.Spend ? (
      <UsageBarChart categories={spendCate} data={spendData} index="day" stack={true} />
    ) : (
      <UsageBarChart categories={tokenCate} data={tokenData} index="day" stack={true} />
    ));

  return (
    <StatsFormGroup
      extra={
        <Segmented
          onChange={(value) => setType(value as ShowType)}
          options={[
            { label: t('usage.trends.spend'), value: ShowType.Spend },
            { label: t('usage.trends.tokens'), value: ShowType.Token },
          ]}
          value={type}
        />
      }
    >
      {isLoading ? <Skeleton.Block height={280} /> : charts}
    </StatsFormGroup>
  );
});

export default UsageTrends;
