import {
    Handle,
    Position,
} from '@xyflow/react';
import { Card, Dropdown, Switch, Typography } from 'antd';
import { createStyles } from 'antd-style';
import { ActionIcon, type DropdownProps, Icon, Input, Markdown } from '@lobehub/ui';
import { DeleteIcon, MoreVerticalIcon } from 'lucide-react';

import { canvasSelectors, useFlowStore } from '@/store/flow';
import { Flexbox } from 'react-layout-kit';
import { useState } from 'react';

interface CanvasNodeProps {
    data: { label: string; content: string };
    id: string;
}

const useStyles = createStyles(() => {
    return {
        flowNode: {
            // header: css`
            //     background: ${token.colorInfoBg}
            // `,
            minWidth: 360,
            minHeight: 240,
            maxHeight: 240,
            maxWidth: 360,
            // overflow: 'hidden',
        },
        mdNode: {
            maxHeight: 130,
            maxWidth: 340,
            overflow: 'auto',
        },
        handle: {
            width: 15,
            height: 15,
        }
    }
});


export default function CanvasNode({ id }: CanvasNodeProps) {
    const { styles } = useStyles();
    const [
        delNode,
        openInDetailBox,
        updateSummaryTitle,
        useSummary,
        setActiveNodeUseSummary,
    ] = useFlowStore(s => [
        s.delNode,
        s.openInDetailBox,
        s.updateSummaryTitle,
        canvasSelectors.getActiveNodeMeta(s)?.useSummary,
        canvasSelectors.setActiveNodeUseSummary(s),
    ])

    const [editTitle, setEditTitle] = useState(false);

    const nodeMeta = useFlowStore(s => s.getNodeMeta(id));

    const body = nodeMeta?.useSummary ?
        nodeMeta.summary :
        (nodeMeta?.messages?.[nodeMeta.messages.length - 1]?.content || 'no content yet, try talk to me!');

    const [value, setValue] = useState(nodeMeta?.title || 'Untitled');

    const menu: DropdownProps['menu'] = {
        items: [
            {
                icon: <Icon icon={DeleteIcon} />,
                key: 'del',
                label: '删除',
            },
        ],
        onClick: ({ domEvent, key }) => {
            domEvent.stopPropagation();
            if (key === 'del') {
                // Handle delete action
                delNode(id);
            }
        }
    };

    const handleClick = () => {
        openInDetailBox(id);
    }

    const handleSubmit = () => {
        setEditTitle(false);
        updateSummaryTitle(value)
    }

    return (
        <Card
            className={styles.flowNode}
            title={
                <Flexbox align='center' horizontal>
                    {
                        editTitle ? (
                            <Input onPressEnter={handleSubmit} value={value} defaultValue={nodeMeta?.title || 'Untitled'} onChange={e => setValue(e.target.value)} />
                        ) : (
                            <Typography.Title level={5} onDoubleClick={() => setEditTitle(true)}>{nodeMeta?.title || 'Untitled'}</Typography.Title>
                        )
                    }
                    <Flexbox style={{ marginLeft: 'auto' }}>
                        <Switch
                            checkedChildren={'使用总结'}
                            unCheckedChildren={'使用聊天历史'}
                            value={useSummary} onChange={(checked) => setActiveNodeUseSummary(checked)}
                        />
                    </Flexbox>
                </Flexbox>
            }
            extra={
                <Dropdown
                    menu={menu}
                    trigger={['click', 'hover']}
                >
                    <ActionIcon size={'small'} icon={MoreVerticalIcon} />
                </Dropdown>
            }
            onClick={handleClick}
        >
            <Handle className={styles.handle} type="target" position={Position.Left} />
            <Markdown className={styles.mdNode}>
                {body}
            </Markdown>
            <Handle className={styles.handle} type="source" position={Position.Right} />
        </Card>
    );
}