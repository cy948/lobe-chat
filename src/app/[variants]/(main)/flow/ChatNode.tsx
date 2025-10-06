import {
    Handle,
    Position,
} from '@xyflow/react';
import { Card, Dropdown, Typography } from 'antd';
import { createStyles } from 'antd-style';
import { ActionIcon, type DropdownProps, Icon, Markdown } from '@lobehub/ui';
import { DeleteIcon, MoreVerticalIcon } from 'lucide-react';

import { useFlowStore } from '@/store/flow';

interface CanvasNodeProps {
    data: { label: string; content: string };
    id: string;
}

const useStyles = createStyles(({ css, token, isDarkMode }) => {
    return {
        flowNode: {
            // header: css`
            //     background: ${token.colorInfoBg}
            // `,
            minWidth: 160,
            minHeight: 120,
        }
    }
});


export default function CanvasNode({ data, id }: CanvasNodeProps) {
    const { styles } = useStyles();
    const [delNode, setNodeDetailDrawer, setActiveNode] = useFlowStore(s => [s.delNode, s.setNodeDetailDrawer, s.setActiveNode])
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

    const handleClick = (event) => {
        setNodeDetailDrawer(true);
        setActiveNode(id);
    }

    return (
        <Card
            className={styles.flowNode}
            title={<Typography.Title level={2}>{data.label}</Typography.Title>}
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
            <Handle type="target" position={Position.Left} />
            <Markdown>
                {data.content}
            </Markdown>
            <Handle type="source" position={Position.Right} />
        </Card>
    );
}