import { ProviderIcon } from '@lobehub/icons';
import { Tag } from '@lobehub/ui';
import { Table, TableColumnType, Typography } from 'antd';
import { useTheme } from 'antd-style';
import { parseAsInteger, useQueryState } from 'nuqs';
import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Flexbox } from 'react-layout-kit';

import { useClientDataSWR } from '@/libs/swr';
import { usageService } from '@/services/usage';
import { formatDate, formatNumber } from '@/utils/format';

import { UsageChartProps } from '../Client';

const UsageTable = memo<UsageChartProps>(({ dateStrings }) => {
  const theme = useTheme();
  const { t } = useTranslation('auth');

  const { data, isLoading, mutate } = useClientDataSWR('usage-logs', async () =>
    usageService.findByMonth(dateStrings),
  );

  const [currentPage, setCurrentPage] = useQueryState(
    'current',
    parseAsInteger.withDefault(1).withOptions({ clearOnDefault: true }),
  );
  const [pageSize, setPageSize] = useQueryState(
    'pageSize',
    parseAsInteger.withDefault(5).withOptions({ clearOnDefault: true }),
  );

  useEffect(() => {
    if (dateStrings) {
      mutate();
    }
  }, [dateStrings]);

  const columns: TableColumnType<any>[] = [
    {
      hidden: true,
      key: 'id',
      title: 'ID',
    },
    {
      dataIndex: 'model',
      key: 'model',
      render: (value, record) => (
        <Flexbox align={'start'} gap={16} horizontal>
          <ProviderIcon
            provider={record.provider}
            size={18}
            style={{
              border: `2px solid ${theme.colorBgContainer}`,
              boxSizing: 'content-box',
              marginRight: -8,
            }}
          />
          <Typography.Text>
            {value?.length > 12 ? `${value.slice(0, 12)}...` : value}
          </Typography.Text>
        </Flexbox>
      ),
      title: t('usage.table.model'),
    },
    {
      dataIndex: 'type',
      filters: [
        {
          text: 'Chat',
          value: 'chat',
        },
      ],
      key: 'type',
      onFilter: (value, record) => record.callType === value,
      render: (value) => {
        return <Tag>{value}</Tag>;
      },
      title: t('usage.table.type'),
    },
    {
      dataIndex: 'totalInputTokens',
      key: 'inputTokens',
      title: t('usage.table.inputTokens'),
    },
    {
      dataIndex: 'totalOutputTokens',
      key: 'outputTokens',
      title: t('usage.table.outputTokens'),
    },
    {
      dataIndex: 'tps',
      key: 'tps',
      render: (value) => formatNumber(value, 2),
      title: t('usage.table.tps'),
    },
    {
      dataIndex: 'ttft',
      key: 'ttft',
      render: (value) => formatNumber(value / 1000, 2),
      title: t('usage.table.ttft'),
    },
    {
      dataIndex: 'spend',
      key: 'spend',
      render: (value) => {
        return `$${formatNumber(value, 6)}`;
      },
      title: t('usage.table.spend'),
    },
    {
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value) => {
        return formatDate(new Date(value));
      },
      sortDirections: ['descend'],
      sorter: (a, b) => a.createdAt - b.createdAt,
      title: t('usage.table.createdAt'),
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={data}
      key="id"
      loading={isLoading}
      pagination={{
        current: currentPage,
        onChange: (page) => {
          setCurrentPage(page);
        },
        onShowSizeChange: (current, size) => {
          setCurrentPage(current);
          setPageSize(size);
        },
        pageSize,
      }}
      size="small"
    />
  );
});

export default UsageTable;
