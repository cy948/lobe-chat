/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
import { ScrollShadow } from '@lobehub/ui';
import { EditableMessage } from '@lobehub/ui/chat';
import { Handle, Position } from '@xyflow/react';
import { createStyles } from 'antd-style';
import { useCallback, useState } from 'react';
import { Flexbox } from 'react-layout-kit';

import { canvasSelectors, useGraphStore } from '@/store/graph';

const useStyles = createStyles(({ token }) => {
  return {
    flowNode: {
      backgroundColor: token.colorBgContainer,
      height: 240,
      padding: token.paddingSM,
      width: 360,
    },
    handle: {
      height: 15,
      width: 15,
      // zIndex: token.zIndexPopupBase,
    },
  };
});

interface TextNodeProps {
  data: { content: string; label: string };
  id: string;
}

export default function TextNode({ id }: TextNodeProps) {
  const { styles } = useStyles();
  const [edit, setEdit] = useState(false);
  const [openModal, setOpenModal] = useState(false);

  const [nodeMeta, updateNodeMeta] = useGraphStore((s) => [
    canvasSelectors.getActiveCanvasNodeMeta(s)(id),
    s.updateNodeMeta,
  ]);

  const [value, setValue] = useState('');

  const onDoubleClick = useCallback(() => {
    setEdit(true);
  }, [setEdit]);

  const onEditChange = useCallback(
    async (editing: boolean) => {
      setEdit(editing);
      if (!editing) {
        console.log('Save val:', value);
        await updateNodeMeta(id, { summary: value });
      }
    },
    [value, updateNodeMeta],
  );

  return (
    <Flexbox horizontal>
      <Handle className={styles.handle} position={Position.Left} type="target" />
      <Flexbox className={styles.flowNode}>
        <ScrollShadow height={230} onDoubleClick={onDoubleClick} width={'100%'}>
          <EditableMessage
            editing={edit}
            onChange={(val) => setValue(val)}
            onEditingChange={onEditChange}
            onOpenChange={(open) => setOpenModal(open)}
            openModal={openModal}
            value={nodeMeta?.summary!}
          />
        </ScrollShadow>
      </Flexbox>
      <Handle className={styles.handle} position={Position.Right} type="source" />
    </Flexbox>
  );
}
