'use client';

import { ActionIcon } from '@lobehub/ui';
import { CirclePlusIcon, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Flexbox } from 'react-layout-kit';

import { DESKTOP_HEADER_ICON_SIZE } from '@/const/layoutTokens';
import { useGraphStore } from '@/store/graph';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';
import { HotkeyEnum } from '@/types/hotkey';

const HeaderAction = memo<{ className?: string }>(({ className }) => {
  const { t } = useTranslation('chat');
  const hotkey = useUserStore(settingsSelectors.getHotkeyById(HotkeyEnum.ToggleRightPanel));

  const [showStateList, toggleConfig, createState] = useGraphStore((s) => [
    s.showSideBar,
    s.setSideBar,
    s.createState,
  ]);

  return (
    <Flexbox className={className} gap={4} horizontal>
      <ActionIcon
        icon={CirclePlusIcon}
        onClick={() => createState()}
        size={DESKTOP_HEADER_ICON_SIZE}
        title={'Create New State'}
      />
      <ActionIcon
        icon={showStateList ? PanelRightClose : PanelRightOpen}
        onClick={() => toggleConfig(!showStateList)}
        size={DESKTOP_HEADER_ICON_SIZE}
        title={t('toggleRightPanel.title', { ns: 'hotkey' })}
        tooltipProps={{
          hotkey,
          placement: 'bottom',
        }}
      />
    </Flexbox>
  );
});

export default HeaderAction;
