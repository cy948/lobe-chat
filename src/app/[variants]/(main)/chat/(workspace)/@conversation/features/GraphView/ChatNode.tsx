import { useChatStore } from '@/store/chat';
import { chatSelectors } from '@/store/chat/selectors';
import { Markdown, MaskShadow } from '@lobehub/ui';
import { Handle, Position } from '@xyflow/react'
import { Card } from "antd";
import { createStyles } from "antd-style";
import { Flexbox } from "react-layout-kit";

interface ChatNodeProps {
    id: string;
}

const useStyles = createStyles(() => {
    return {
        flowNode: {
            height: 240,
            width: 360,
        },
        handle: {
            height: 10,
            width: 10,
        },
        mdNode: {
            height: 140,
            width: 340,
            // overflow: 'auto',
        },
    };
});

export default function ChatNode({ id }: ChatNodeProps) {

    const { styles } = useStyles();

    const [parentMsg] = useChatStore((s) => [chatSelectors.getMessageById(id)(s)])
    const [currentMsg] = useChatStore((s) => [chatSelectors.getMessageById(parentMsg?.parentId || '')(s)])


    return (
        <Card
            className={styles.flowNode}
            title={
                <Flexbox align="center" horizontal>
                    {currentMsg?.content}
                </Flexbox>
            }
        >
            <Handle className={styles.handle} position={Position.Left} type="target" />
            <MaskShadow className={styles.mdNode} padding={4}>
                <Markdown>{parentMsg?.content || ''}</Markdown>
            </MaskShadow>
            <Handle className={styles.handle} position={Position.Right} type="source" />
        </Card>
    )
}