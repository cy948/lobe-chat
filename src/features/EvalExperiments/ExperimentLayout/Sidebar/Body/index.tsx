'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { Database, LayoutDashboard, Play } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import NavItem from '@/features/NavPanel/components/NavItem';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { experimentSelectors, useEvalStore } from '@/store/eval';

const Body = memo(() => {
  const { t } = useTranslation('eval');
  const { experimentId } = useParams<{ experimentId: string }>();
  const useFetchExperimentDetail = useEvalStore((s) => s.useFetchExperimentDetail);
  const experiment = useEvalStore(experimentSelectors.getExperimentDetailById(experimentId || ''));

  useFetchExperimentDetail(experimentId);
  const scopedDatasets = experiment?.datasets || [];
  const runs = experiment?.runs || [];

  return (
    <Flexbox gap={8} paddingInline={4}>
      <Flexbox paddingInline={4}>
        <WorkspaceLink to={`/eval/experiments/${experimentId}`}>
          <NavItem active icon={LayoutDashboard} iconSize={16} title={t('sidebar.dashboard')} />
        </WorkspaceLink>
      </Flexbox>
      <Flexbox gap={1} paddingInline={4}>
        <NavItem
          disabled
          icon={Database}
          iconSize={16}
          title={t('experiment.detail.datasetsScoped')}
          extra={
            scopedDatasets.length > 0 && (
              <Text fontSize={11} type="secondary">
                {scopedDatasets.length}
              </Text>
            )
          }
        />
        <NavItem
          disabled
          icon={Play}
          iconSize={16}
          title={t('sidebar.runs')}
          extra={
            runs.length > 0 && (
              <Text fontSize={11} type="secondary">
                {runs.length}
              </Text>
            )
          }
        />
      </Flexbox>
    </Flexbox>
  );
});

export default Body;
