import { ChatMessage } from '@lobechat/types';
import { ActionIconGroup, type ActionIconGroupEvent, type ActionIconGroupProps } from '@lobehub/ui';
import { App } from 'antd';
import { memo, use, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { VirtuosoContext } from '@/features/Conversation/components/VirtualizedList/VirtuosoContext';

import { useChatListActionsBar } from './useChatListActionsBar';
import { useGraphStore } from '@/store/graph';

export type ActionsBarProps = ActionIconGroupProps;

const ActionsBar = memo<ActionsBarProps>((props) => {
  const { delAndRegenerate, regenerate, edit, copy, setAsSummary, divider, del } =
    useChatListActionsBar();

  return (
    <ActionIconGroup
      items={[delAndRegenerate, edit, setAsSummary]}
      menu={{
        items: [edit, copy, regenerate, divider, del],
      }}
      {...props}
    />
  );
});

interface ActionsProps {
  data: ChatMessage;
  id: string;
  index: number;
}

const Actions = memo<ActionsProps>(({ id, index, data }) => {
  // const item = useFlowStore(canvasSelectors.getMessageById(id), isEqual);
  const { t } = useTranslation('common');

  const [
    deleteMessage,
    copyMessage,
    updateInputSummary,
    toggleMessageEditing,
    regenerateMessage,
    delAndRegenerateMessage,
  ] = useGraphStore((s) => [
    s.deleteMessage,
    s.copyMessage,
    s.updateInputSummary,
    s.toggleMessageEditing,
    s.regenerateMessage,
    s.delAndRegenerateMessage,
  ]);

  const { message } = App.useApp();
  const virtuosoRef = use(VirtuosoContext);

  // const [showShareModal, setShareModal] = useState(false);

  const handleActionClick = useCallback(
    async (action: ActionIconGroupEvent) => {
      switch (action.key) {
        case 'edit': {
          toggleMessageEditing(id, true);

          virtuosoRef?.current?.scrollIntoView({ align: 'start', behavior: 'auto', index });
        }
      }
      // if (!item) return;

      switch (action.key) {
        case 'copy': {
          await copyMessage(id, data.content);
          message.success(t('copySuccess', { defaultValue: 'Copy Success' }));
          break;
        }

        case 'setAsSummary': {
          updateInputSummary(data.content);
          message.success('已设为总结');
          break;
        }

        case 'del': {
          deleteMessage(id);
          break;
        }

        case 'regenerate': {
          regenerateMessage(id);

          // if this message is an error message, we need to delete it
          if (data.error) deleteMessage(id);
          break;
        }

        case 'delAndRegenerate': {
          delAndRegenerateMessage(id);
          break;
        }
      }
    },
    [data.content, data.error],
  );

  const RenderFunction = ActionsBar;

  return <RenderFunction onActionClick={handleActionClick} />;
});

export default Actions;
