'use client';

import { ActionIcon, Block, Center, Skeleton, stopPropagation, Text } from '@lobehub/ui';
import { type DropdownItem, DropdownMenu } from '@lobehub/ui/base-ui';
import { Beaker, ChevronsUpDownIcon } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { experimentSelectors, useEvalStore } from '@/store/eval';

const ExperimentHead = memo<{ id: string }>(({ id }) => {
  const navigate = useWorkspaceAwareNavigate();
  const useFetchExperiments = useEvalStore((s) => s.useFetchExperiments);
  useFetchExperiments();

  const experiment = useEvalStore(experimentSelectors.getExperimentDetailById(id));
  const experimentList = useEvalStore(experimentSelectors.experimentList);

  const name = experiment?.name || experimentList.find((item) => item.id === id)?.name;

  const handleClick = useCallback(() => {
    navigate(`/eval/experiments/${id}`);
  }, [id, navigate]);

  const handleExperimentSwitch = useCallback(
    (experimentId: string) => {
      setTimeout(() => {
        navigate(`/eval/experiments/${experimentId}`);
      }, 0);
    },
    [navigate],
  );

  const menuItems = useMemo<DropdownItem[]>(() => {
    if (!experimentList || experimentList.length === 0) return [];

    return experimentList.map((item) => ({
      icon: (
        <Center style={{ color: 'var(--ant-color-text-tertiary)', minWidth: 16 }} width={16}>
          <Beaker size={14} />
        </Center>
      ),
      key: item.id,
      label: item.name,
      onClick: () => handleExperimentSwitch(item.id),
      style: item.id === id ? { backgroundColor: 'var(--ant-control-item-bg-active)' } : {},
    }));
  }, [experimentList, handleExperimentSwitch, id]);

  return (
    <Block
      clickable
      horizontal
      align={'center'}
      gap={8}
      padding={2}
      style={{ minWidth: 32, overflow: 'hidden' }}
      variant={'borderless'}
      onClick={handleClick}
    >
      <Center style={{ minWidth: 32 }} width={32}>
        <Beaker size={18} />
      </Center>
      {!name ? (
        <Skeleton active paragraph={false} title={{ style: { marginBottom: 0 }, width: 80 }} />
      ) : (
        <DropdownMenu items={menuItems} placement="bottomRight">
          <Center
            horizontal
            gap={4}
            style={{ cursor: 'pointer', flex: 1, overflow: 'hidden' }}
            onClick={stopPropagation}
          >
            <Text ellipsis style={{ flex: 1 }} weight={500}>
              {name}
            </Text>
            <ActionIcon
              icon={ChevronsUpDownIcon}
              style={{ width: 24 }}
              size={{
                blockSize: 28,
                size: 16,
              }}
            />
          </Center>
        </DropdownMenu>
      )}
    </Block>
  );
});

ExperimentHead.displayName = 'ExperimentHead';

const Header = memo(() => {
  const { experimentId } = useParams<{ experimentId: string }>();
  const { t } = useTranslation('common');

  return (
    <SideBarHeaderLayout
      backTo="/eval"
      left={<ExperimentHead id={experimentId || ''} />}
      breadcrumb={[
        {
          href: `/eval/experiments/${experimentId}`,
          title: t('tab.eval'),
        },
      ]}
    />
  );
});

export default Header;
