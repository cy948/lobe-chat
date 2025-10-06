import { type BarChartProps } from '@lobehub/charts';
import { Segmented } from '@lobehub/ui';
import { useState, memo } from 'react';

import { UsageLog } from '@/types/usage/usageRecord';
import StatisticCard from '@/components/StatisticCard';

import { UsageChartProps, GroupBy } from '../Client';
import { UsageBarChart } from './components/UsageBarChart';
import { formatNumber } from '@/utils/format';

const groupByType = (
    data: UsageLog[],
    type: 'spend' | 'token',
    groupBy: GroupBy,
): { categories: string[]; data: BarChartProps['data'] } => {
    if (!data || data.length === 0) return { categories: [], data: [] };
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
        const totalObj = {
            day: log.day,
            total: type === 'spend' ? log.totalSpend : log.totalTokens,
        };
        let todayCate = new Map<string, number>(cate);
        for (const item of log.records) {
            const value = type === 'spend' ? (item.spend || 0) : (item.totalTokens || 0);
            const key = groupBy === GroupBy.Model ? item.model : item.provider;
            let displayValue = (todayCate.get(key) || 0) + value;
            if (type === 'spend') {
                const formattedNum = formatNumber(((todayCate.get(key) || 0) + value), 2)
                if (typeof formattedNum !== 'string') {
                    displayValue = formattedNum
                } else {
                    displayValue = displayValue
                }
            }
            todayCate.set(
                key,
                displayValue,
            );
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
    const [type, setType] = useState<ShowType>(ShowType.Spend);

    const { categories: spendCate, data: spendData } = groupByType(data || [], 'spend', groupBy || GroupBy.Model);
    const { categories: tokenCate, data: tokenData } = groupByType(data || [], 'token', groupBy || GroupBy.Model);
    return (
        <StatisticCard
            chart={
                data &&
                (type === ShowType.Spend ? (
                    <UsageBarChart categories={spendCate} data={spendData} index="day" />
                ) : (
                    <UsageBarChart categories={tokenCate} data={tokenData} index="day" />
                ))
            }
            extra={
                <Segmented
                    onChange={(value) => setType(value as ShowType)}
                    options={[
                        { label: 'Spend', value: ShowType.Spend },
                        { label: 'Token', value: ShowType.Token },
                    ]}
                    value={type}
                />
            }
            loading={isLoading}
        />
    );
});

export default UsageTrends;