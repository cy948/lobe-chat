'use client';

import type { AgentEvalDatasetListItem } from '@lobechat/types';
import { Flexbox, Icon, Tag } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { Database } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { DATASET_PRESETS } from './datasetPresets';

const styles = createStaticStyles(({ css, cssVar }) => ({
  datasetDescription: css`
    overflow: hidden;

    margin: 0;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  datasetHeader: css`
    display: flex;
    gap: 12px;
    align-items: center;

    width: 100%;
    padding: 16px;
  `,
  datasetHeaderButton: css`
    cursor: pointer;

    border: none;

    text-align: start;

    background: transparent;

    transition: background 0.2s;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  datasetIcon: css`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 32px;
    height: 32px;
    border-radius: 8px;

    background: ${cssVar.colorPrimaryBg};
  `,
  datasetName: css`
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
  meta: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

type DatasetListItemData = AgentEvalDatasetListItem & {
  metadata?: Record<string, unknown> | null;
};

interface DatasetListItemProps {
  dataset: DatasetListItemData;
  onClick?: () => void;
  trailing?: ReactNode;
}

export const DatasetListItem = memo<DatasetListItemProps>(({ dataset, onClick, trailing }) => {
  const { t } = useTranslation('eval');

  const content = (
    <>
      <div className={styles.datasetIcon}>
        <Icon icon={Database} size={16} style={{ color: 'var(--ant-color-primary)' }} />
      </div>
      <Flexbox flex={1} gap={2} style={{ minWidth: 0 }}>
        <Flexbox horizontal align="center" gap={8}>
          <p className={styles.datasetName}>{dataset.name}</p>
          {typeof dataset.metadata?.preset === 'string' &&
            DATASET_PRESETS[dataset.metadata.preset] && (
              <Tag style={{ fontSize: 10 }}>{DATASET_PRESETS[dataset.metadata.preset].name}</Tag>
            )}
        </Flexbox>
        {dataset.description && <p className={styles.datasetDescription}>{dataset.description}</p>}
      </Flexbox>
      <Flexbox horizontal align="center" gap={8}>
        <span className={styles.meta}>
          {dataset.testCaseCount || 0} {t('benchmark.detail.stats.cases').toLowerCase()}
        </span>
        {trailing}
      </Flexbox>
    </>
  );

  if (onClick) {
    return (
      <button className={`${styles.datasetHeader} ${styles.datasetHeaderButton}`} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={styles.datasetHeader}>{content}</div>;
});
