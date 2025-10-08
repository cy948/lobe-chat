
import { ActionIcon, ScrollShadow } from '@lobehub/ui'
import { Edit } from 'lucide-react';
import SidebarHeader from '@/components/SidebarHeader';

import { EditableMessage } from '@lobehub/ui/chat';
import { useState } from 'react';
import { canvasSelectors, useFlowStore } from '@/store/flow';
import { useTranslation } from 'react-i18next';

import { createStyles } from 'antd-style';

const useStyles = createStyles(({ css, token }) => ({
    animatedContainer: css`
    transition:
      height 0.3s ease,
      opacity 0.3s ease;
  `,
    prompt: css`
    opacity: 0.75;
    transition: opacity 200ms ${token.motionEaseOut};

    &:hover {
      opacity: 1;
    }
  `,
    promptBox: css`
    position: relative;
    border-block-end: 1px solid ${token.colorBorderSecondary};
  `,
}));

export default function SummaryDetail() {

    const { styles, cx } = useStyles();
    const [editing, setEditing] = useState(false);
    // const [expanded, setExpanded] = useState(false);
    const expanded = true;
    const { t } = useTranslation('common');

    const [
        setInputSummary, 
        isGeneratingSummary, 
        summary,
    ] = useFlowStore((s) => [
        s.updateInputSummary,
        s.isGeneratingSummary,
        canvasSelectors.getActiveNodeMeta(s)?.summary,
    ])

    const nodeMeta = useFlowStore(s => canvasSelectors.getActiveNodeMeta(s));

    const toggleExpanded = () => {
        if (editing) return;
        // setExpanded(!expanded);
    }

    return (
        <>
            <SidebarHeader
                actions={
                    <ActionIcon icon={Edit} disabled={isGeneratingSummary} onClick={() => setEditing(true)} size={'small'} title={t('edit')} />
                }
                onClick={toggleExpanded}
                style={{ cursor: 'pointer' }}
                title={nodeMeta?.title || 'Untitled'}
            />
            <ScrollShadow
                className={cx(styles.promptBox, styles.animatedContainer)}
                height={expanded ? 200 : 0}
                // onClick={handleOpen}
                onDoubleClick={() => {
                    // if (e.altKey) handleOpenWithEdit(e);
                    setEditing(true);
                }}
                paddingInline={16}
                size={25}
                style={{
                    opacity: 1,
                    overflow: 'hidden',
                    transition: 'height 0.3s ease',
                }}
            >
                <EditableMessage
                    classNames={{ markdown: styles.prompt }}
                    editing={editing}
                    markdownProps={{ enableLatex: false, enableMermaid: false }}
                    onChange={(e) => {
                        setInputSummary(e);
                    }}
                    onEditingChange={setEditing}
                    // onOpenChange={setOpen}
                    // openModal={open}
                    placeholder={`${t('settingAgent.prompt.placeholder', { ns: 'setting' })}...`}
                    styles={{ markdown: { opacity: 0.5, overflow: 'visible' } }}
                    text={{
                        cancel: t('cancel'),
                        confirm: t('ok'),
                        edit: t('edit'),
                        title: 'Edit Summary',
                    }}
                    value={summary!}
                    defaultValue={nodeMeta?.summary || ''}
                />

            </ScrollShadow>
        </>
    )
}