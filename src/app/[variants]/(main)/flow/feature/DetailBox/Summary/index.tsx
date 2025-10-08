
import { Flexbox } from 'react-layout-kit';
import { ActionIcon, Button, Collapse, CollapseProps, ScrollShadow } from '@lobehub/ui'
import { Switch } from 'antd';
import { Edit, RotateCcwIcon, SettingsIcon } from 'lucide-react';
import useMergeState from 'use-merge-value';
import SidebarHeader from '@/components/SidebarHeader';

import { createStyles } from 'antd-style';
import { EditableMessage } from '@lobehub/ui/chat';
import { useState } from 'react';
import { useFlowStore } from '@/store/flow';
import { useTranslation } from 'react-i18next';

export const useStyles = createStyles(({ css, token }) => ({
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


function SummaryDetail() {

    const { styles, cx } = useStyles();
    const [editing, setEditing] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const { t } = useTranslation('common');

    const [inputSummary, setInputSummary,] = useFlowStore((s) => [
        s.inputSummary,
        s.updateInputSummary,
    ])

    const nodeMeta = useFlowStore(s => s.getNodeMeta(s.activeNodeId!))

    const toggleExpanded = () => {
        if (editing) return;
        setExpanded(!expanded);
    }

    return (
        <>
            <SidebarHeader
                actions={
                    <ActionIcon icon={Edit} onClick={() => setEditing(true)} size={'small'} title={t('edit')} />
                }
                onClick={toggleExpanded}
                style={{ cursor: 'pointer' }}
                title={nodeMeta?.title || 'Untitled'}
            />
            <ScrollShadow
                className={cx(styles.promptBox, styles.animatedContainer)}
                height={expanded ? 200 : 0}
                // onClick={handleOpen}
                onDoubleClick={(e) => {
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
                    value={inputSummary}
                    defaultValue={nodeMeta?.summary || ''}
                />

            </ScrollShadow>
        </>
    )
}

export default function NodeSummary() {
    const items: CollapseProps['items'] = [
        {
            children: <SummaryDetail />,
            // desc: 'The summary of this panel [Will be put into chat context]',
            extra: (
                <Flexbox horizontal gap={16}>
                    <Flexbox horizontal gap={8} align='center'>
                        Use Summary
                        <Switch defaultValue={true}></Switch>
                    </Flexbox>
                    <Flexbox>
                        <Button icon={RotateCcwIcon}>
                            Generate
                        </Button>
                    </Flexbox>
                    <ActionIcon
                        icon={SettingsIcon}
                        // If you want to prevent the event from bubbling up,
                        // you can use the stopPropagation method.
                        onClick={(e) => e.stopPropagation()}
                        size={'small'}
                    />
                </Flexbox>
            ),
            key: '1',
            label: 'Summary',
        },
    ]


    return (<Collapse items={items}></Collapse>)
}