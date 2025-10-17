import {
  ActionIcon,
  type DropdownProps,
  EditableText,
  Icon,
  Markdown,
  MaskShadow,
} from '@lobehub/ui';
import { Handle, Position } from '@xyflow/react';
import { Card, Dropdown } from 'antd';
import { createStyles } from 'antd-style';
import { DeleteIcon, MoreVerticalIcon, TimerIcon, TimerOffIcon } from 'lucide-react';
import { useCallback } from 'react';
import { Flexbox } from 'react-layout-kit';

import { canvasSelectors, messageSelectors, useGraphStore } from '@/store/graph';

interface CanvasNodeProps {
  data: { content: string; label: string };
  id: string;
}

const useStyles = createStyles(() => {
  return {
    flowNode: {
      height: 240,
      width: 360,
    },
    handle: {
      height: 15,
      width: 15,
    },
    mdNode: {
      height: 140,
      width: 340,
      // overflow: 'auto',
    },
  };
});

export default function ChatNode({ id }: CanvasNodeProps) {
  const { styles } = useStyles();

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

  // const [value, setValue] = useState(nodeMeta?.title || 'Untitled');

  const handleDelNode = useCallback(async () => {
    await delNode(id);
  }, [delNode]);

  const handleChangeTitle = useCallback(
    async (v: string) => {
      if (v !== nodeMeta?.title) await updateNodeMeta(id, { title: v });
    },
    [updateNodeMeta],
  );

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

  const handleClick = useCallback(async () => {
    await openNodePortal(id);
  }, [openNodePortal, id]);

  return (
    <Card
      className={styles.flowNode}
      extra={
        <Dropdown menu={menu as any} trigger={['click', 'hover']}>
          <ActionIcon icon={MoreVerticalIcon} size={'small'} />
        </Dropdown>
      }
      title={
        <Flexbox align="center" horizontal>
          <EditableText
            // onChange={setValue}
            onChangeEnd={handleChangeTitle}
            value={nodeMeta?.title || 'Untitled'}
          />
          <Flexbox align="center" horizontal style={{ marginLeft: 'auto' }}>
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
      <MaskShadow className={styles.mdNode} onClick={handleClick} padding={4}>
        <Markdown>{body || ''}</Markdown>
      </MaskShadow>
      <Handle className={styles.handle} position={Position.Right} type="source" />
    </Card>
  );
}
