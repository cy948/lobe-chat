import { ActionIcon, type DropdownProps, Icon, Input, Markdown } from '@lobehub/ui';
import { Handle, Position } from '@xyflow/react';
import { Card, Dropdown, Switch, Typography } from 'antd';
import { createStyles } from 'antd-style';
import { DeleteIcon, MoreVerticalIcon } from 'lucide-react';
import { useState } from 'react';
import { Flexbox } from 'react-layout-kit';

import { useFlowStore } from '@/store/flow';

interface CanvasNodeProps {
  data: { content: string; label: string };
  id: string;
}

const useStyles = createStyles(() => {
  return {
    flowNode: {
      maxHeight: 240,

      maxWidth: 360,

      minHeight: 240,
      // header: css`
      //     background: ${token.colorInfoBg}
      // `,
      minWidth: 360,
      // overflow: 'hidden',
    },
    handle: {
      height: 15,
      width: 15,
    },
    mdNode: {
      maxHeight: 130,
      maxWidth: 340,
      overflow: 'auto',
    },
  };
});

export default function CanvasNode({ id }: CanvasNodeProps) {
  const { styles } = useStyles();
  const [delNode, openInDetailBox, updateSummaryTitle, setNodeMeta] = useFlowStore((s) => [
    s.delNode,
    s.openInDetailBox,
    s.updateSummaryTitle,
    s.setNodeMeta,
  ]);

  const [editTitle, setEditTitle] = useState(false);

  const nodeMeta = useFlowStore((s) => s.getNodeMeta(id));

  const body = nodeMeta?.useSummary
    ? nodeMeta.summary
    : nodeMeta?.messages?.[nodeMeta.messages.length - 1]?.content ||
      'no content yet, try talk to me!';

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
    },
  };

  const handleClick = () => {
    openInDetailBox(id);
  };

  const handleSubmit = () => {
    setEditTitle(false);
    updateSummaryTitle(value);
  };

  return (
    <Card
      className={styles.flowNode}
      extra={
        <Dropdown menu={menu as any} trigger={['click', 'hover']}>
          <ActionIcon icon={MoreVerticalIcon} size={'small'} />
        </Dropdown>
      }
      onClick={handleClick}
      title={
        <Flexbox align="center" horizontal>
          {editTitle ? (
            <Input
              defaultValue={nodeMeta?.title || 'Untitled'}
              onChange={(e) => setValue(e.target.value)}
              onPressEnter={handleSubmit}
              value={value}
            />
          ) : (
            <Typography.Title level={5} onDoubleClick={() => setEditTitle(true)}>
              {nodeMeta?.title || 'Untitled'}
            </Typography.Title>
          )}
          <Flexbox align="center" horizontal style={{ marginLeft: 'auto' }}>
            <Switch
              onChange={(checked) => setNodeMeta(id, { useSummary: checked })}
              value={nodeMeta?.useSummary}
            />
          </Flexbox>
        </Flexbox>
      }
    >
      <Handle className={styles.handle} position={Position.Left} type="target" />
      <Markdown className={styles.mdNode}>{body}</Markdown>
      <Handle className={styles.handle} position={Position.Right} type="source" />
    </Card>
  );
}
