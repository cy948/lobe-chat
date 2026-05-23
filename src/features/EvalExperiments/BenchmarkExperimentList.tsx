'use client';

import { Card, Tag } from 'antd';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

interface BenchmarkExperimentListProps {
  experiments: { id: string; name: string }[];
}

const BenchmarkExperimentList = memo<BenchmarkExperimentListProps>(({ experiments }) => {
  const { t } = useTranslation('eval');

  return (
    <Card size="small" title={t('benchmark.detail.tabs.experiments')}>
      {experiments.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {experiments.map((experiment) => (
            <Link key={experiment.id} to={`/eval/experiments/${experiment.id}`}>
              <Tag>{experiment.name}</Tag>
            </Link>
          ))}
        </div>
      ) : null}
    </Card>
  );
});

export default BenchmarkExperimentList;
