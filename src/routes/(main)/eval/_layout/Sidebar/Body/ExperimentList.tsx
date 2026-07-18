'use client';

import { AccordionItem, Flexbox, Text } from '@lobehub/ui';
import { Beaker } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import NavItem from '@/features/NavPanel/components/NavItem';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { experimentSelectors, useEvalStore } from '@/store/eval';
import { isModifierClick } from '@/utils/navigation';

interface ExperimentListProps {
  activeKey: string;
  itemKey: string;
}

const ExperimentList = memo<ExperimentListProps>(({ activeKey, itemKey }) => {
  const { t } = useTranslation('eval');
  const navigate = useWorkspaceAwareNavigate();
  const experiments = useEvalStore(experimentSelectors.experimentList);
  const isInit = useEvalStore(experimentSelectors.isExperimentListInit);

  return (
    <AccordionItem
      itemKey={itemKey}
      paddingBlock={4}
      paddingInline={'8px 4px'}
      title={
        <Flexbox horizontal align="center" gap={4}>
          <Text ellipsis fontSize={12} type="secondary" weight={500}>
            {t('sidebar.experiments')}
          </Text>
          {experiments.length > 0 && (
            <Text fontSize={11} type="secondary">
              {experiments.length}
            </Text>
          )}
        </Flexbox>
      }
    >
      <Flexbox gap={1} paddingBlock={1}>
        {!isInit ? (
          <SkeletonList rows={3} />
        ) : experiments.length > 0 ? (
          experiments.map((experiment) => (
            <WorkspaceLink
              key={experiment.id}
              to={`/eval/experiments/${experiment.id}`}
              onClick={(e) => {
                if (isModifierClick(e)) return;
                e.preventDefault();
                navigate(`/eval/experiments/${experiment.id}`);
              }}
            >
              <NavItem
                active={activeKey === `experiment-${experiment.id}`}
                icon={Beaker}
                iconSize={16}
                title={experiment.name}
              />
            </WorkspaceLink>
          ))
        ) : (
          <Text fontSize={12} style={{ padding: '8px 12px' }} type="secondary">
            {t('experiment.card.empty')}
          </Text>
        )}
      </Flexbox>
    </AccordionItem>
  );
});

export default ExperimentList;
