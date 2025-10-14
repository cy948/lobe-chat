import { ActionIcon, type DropdownProps, Icon, Input, Markdown } from '@lobehub/ui';
import { Handle, Position } from '@xyflow/react';
import { Card, Dropdown, Typography } from 'antd';
import { createStyles } from 'antd-style';
import { DeleteIcon, MoreVerticalIcon, TimerIcon, TimerOffIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Flexbox } from 'react-layout-kit';

import { canvasSelectors, messageSelectors, useGraphStore } from '@/store/graph';

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
  // const [delNode, openInDetailBox, updateSummaryTitle, setNodeMeta] = useFlowStore((s) => [
  //   s.delNode,
  //   s.openInDetailBox,
  //   s.updateSummaryTitle,
  //   s.setNodeMeta,
  // ]);

  const [editTitle, setEditTitle] = useState(false);

  // const nodeMeta = useFlowStore((s) => s.getNodeMeta(id));
  const [nodeMeta, messages, openNodePortal, delNode, updateNodeMeta] = useGraphStore((s) => [
    canvasSelectors.getActiveCanvasNodeMeta(s)(id),
    messageSelectors.getNodeMessages(s)(id),
    s.openNodePortal,
    s.delNode,
    s.updateNodeMeta,
  ]);

  const body = nodeMeta?.useSummary
    ? nodeMeta.summary
    : messages?.[messages.length - 1]?.content || 'no content yet, try talk to me!';

  const [value, setValue] = useState(nodeMeta?.title || 'Untitled');

  const handleDelNode = useCallback(async () => {
    await delNode(id);
  }, [delNode]);

  const handleChangeTitle = useCallback(async () => {
    await updateNodeMeta(id, { title: value });
  }, [value, updateNodeMeta]);

  const handleUseSummary = useCallback(
    async (useSummary: boolean) => {
      await updateNodeMeta(id, { useSummary });
    },
    [updateNodeMeta],
  );

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
        handleDelNode();
      }
    },
  };

  const handleClick = () => {
    openNodePortal(id);
  };

  const handleSubmit = () => {
    setEditTitle(false);
    handleChangeTitle();
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
              style={{
                minWidth: 100,
              }}
              value={value}
            />
          ) : (
            <Typography.Title level={5} onDoubleClick={() => setEditTitle(true)}>
              {nodeMeta?.title || 'Untitled'}
            </Typography.Title>
          )}
          <Flexbox align="center" horizontal style={{ marginLeft: 'auto' }}>
            {/* <Switch
              onChange={(checked) => setNodeMeta(id, { useSummary: checked })}
              value={nodeMeta?.useSummary}
            /> */}
            <ActionIcon
              icon={nodeMeta?.useSummary ? TimerIcon : TimerOffIcon}
              onClick={() => handleUseSummary(!nodeMeta?.useSummary)}
              title={nodeMeta?.useSummary ? 'Using summary as context' : 'Using messages context'}
            />
          </Flexbox>
        </Flexbox>
      }
    >
      <Handle className={styles.handle} position={Position.Left} type="target" />
      <Markdown className={styles.mdNode}>{body || ''}</Markdown>
      <Handle className={styles.handle} position={Position.Right} type="source" />
    </Card>
  );
}
