import { ActionIconGroup, type ActionIconGroupEvent, type ActionIconGroupProps } from '@lobehub/ui';
import { App } from 'antd';
import isEqual from 'fast-deep-equal';
import { memo, use, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { VirtuosoContext } from '@/features/Conversation/components/VirtualizedList/VirtuosoContext';

import { useChatListActionsBar } from './useChatListActionsBar';
import ShareMessageModal from '@/features/Conversation/components/ChatItem/ShareMessageModal';
import { useFlowStore, canvasSelectors } from '@/store/flow';

export type ActionsBarProps = ActionIconGroupProps;

const ActionsBar = memo<ActionsBarProps>((props) => {
    const { delAndRegenerate, regenerate, edit, copy, setAsSummary, divider, del } = useChatListActionsBar();

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
    id: string;
    inPortalThread?: boolean;
    index: number;
}

const Actions = memo<ActionsProps>(({ id, index }) => {
    const item = useFlowStore(canvasSelectors.getMessageById(id), isEqual);
    const { t } = useTranslation('common');

    const [
        deleteMessage,
        copyMessage,
        updateInputSummary,
        toggleMessageEditing,
        regenerateMessage,
        delAndRegenerateMessage,
    ] = useFlowStore((s) => [
        s.deleteMessage,
        s.copyMessage,
        s.updateInputSummary,
        s.toggleMessageEditing,
        s.regenerateMessage,
        s.delAndRegenerateMessage,
    ])

    const { message } = App.useApp();
    const virtuosoRef = use(VirtuosoContext);

    const [showShareModal, setShareModal] = useState(false);

    const handleActionClick = useCallback(
        async (action: ActionIconGroupEvent) => {
            switch (action.key) {
                case 'edit': {
                    toggleMessageEditing(id, true);

                    virtuosoRef?.current?.scrollIntoView({ align: 'start', behavior: 'auto', index });
                }
            }
            if (!item) return;

            switch (action.key) {
                case 'copy': {
                    await copyMessage(id, item.content);
                    message.success(t('copySuccess', { defaultValue: 'Copy Success' }));
                    break;
                }

                case 'setAsSummary': {
                    updateInputSummary(item.content);
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
                    if (item.error) deleteMessage(id);
                    break;
                }

                case 'delAndRegenerate': {
                    delAndRegenerateMessage(id);
                    break;
                }

            }
        },
        [item],
    );

    const RenderFunction = ActionsBar;

    if (!item) return null;

    return (
        <>
            <RenderFunction {...item} onActionClick={handleActionClick} />
            {/*{showModal && (*/}
            {/*  <ExportPreview content={item.content} onClose={() => setModal(false)} open={showModal} />*/}
            {/*)}*/}
            <ShareMessageModal
                message={item}
                onCancel={() => {
                    setShareModal(false);
                }}
                open={showShareModal}
            />
        </>
    );
});

export default Actions;
