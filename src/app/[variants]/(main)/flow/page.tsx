'use client';

import { useState, useCallback } from 'react';

import {
    ReactFlow,
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    Handle,
    Position,
    useReactFlow
} from '@xyflow/react';

import { Card, Drawer, Row, Col, Typography, Input } from 'antd'
import { Markdown, MarkdownProps, Button, Dropdown, ActionIcon } from '@lobehub/ui';
// import { AssistantMessage } from '@/features/Conversation/Messages/Assistant';
// import { ChatMessage } from '@/types/message';
// import ChatItem from '@/features/ChatItem';
// import { ChatInputProvider, DesktopChatInput } from '@/features/ChatInput';


import { useFetchMessages } from '@/hooks/useFetchMessages';

import { useChatStore } from '@/store/chat';
import { aiChatSelectors, chatSelectors } from '@/store/chat/selectors';
import { useUserStore } from '@/store/user';
import { preferenceSelectors, settingsSelectors } from '@/store/user/selectors';
import { createStyles } from 'antd-style';

import { useSend } from 'src/app/[variants]/(main)/chat/(workspace)/@conversation/features/ChatInput/useSend';
import TopicList from 'src/app/[variants]/(main)/chat/(workspace)/@topic/features/TopicListContent'
import { useFlowStore } from '@/store/flow';

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

import { type DropdownProps, Icon } from '@lobehub/ui';
import { DeleteIcon, MoreVerticalIcon } from 'lucide-react';

export let id = 1;
const getId = () => `node_${id++}`;

function CustomNode({ data, id }) {
    const [delNode] = useFlowStore(s => [s.delNode])
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

    return (
        <Card
            title={<Typography.Title level={2}>{data.label}</Typography.Title>}
            extra={
                <Dropdown
                    menu={menu}
                    trigger={['click', 'hover']}

                >
                    <ActionIcon size={'small'} icon={MoreVerticalIcon} />
                </Dropdown>
            }
        >
            <Handle type="target" position={Position.Left} />
            <Markdown>
                {data.content}
            </Markdown>
            <Handle type="source" position={Position.Right} />
        </Card>
    );
}

const nodeTypes = { custom: CustomNode };

const FlowPage = () => {
    const { styles } = useStyles();
    useFetchMessages();
    const [
        mainInputSendErrorMsg,
        clearSendMessageError,
        activeTopicId,
        messages
    ] = useChatStore((s) => [
        aiChatSelectors.isCurrentSendMessageError(s),
        s.clearSendMessageError,
        s.activeTopicId,
        chatSelectors.mainDisplayChats(s),
    ]);

    const [
        edges,
        nodes,
        addNode,
        addEdge,
        setNodes,
        setEdges,
        delNode,
        inputMessage,
        setInputMessage,
        fetchAIResponse,
    ] = useFlowStore(
        s => [
            s.edges,
            s.nodes,
            s.addNode,
            s.addEdge,
            s.setNodes,
            s.setEdges,
            s.delNode,
            s.inputMessage,
            s.setInputMessage,
            s.fetchAIResponse,
        ]
    );





    // const initialNodes = [
    //     { id: 'n1', type: 'custom', position: { x: 0, y: 0 }, data: { label: 'Topic 1', description: '*summary1*' } },
    //     { id: 'n2', type: 'custom', position: { x: 300, y: 100 }, data: { label: 'Topic 2', description: '**summary2**' } },
    // ];

    const [open, setOpen] = useState(false);

    const showDrawer = () => {
        setOpen(true);
    };

    const onClose = () => {
        setOpen(false);
    };


    const onNodesChange = useCallback(
        (changes) => setNodes(changes),
        [],
    );
    const onEdgesChange = useCallback(
        (changes) => setEdges(changes),
        [],
    );
    const onConnect = useCallback(
        (params) => addEdge(params),
        [],
    );

    // 3. 定义 onPaneDoubleClick 回调函数
    const { screenToFlowPosition } = useReactFlow();

    const onPaneClick = useCallback(
        (event) => {
            // 检查是否为双击事件
            if (event.detail === 2) {
                // 将屏幕坐标转换为流程图内部坐标
                const position = screenToFlowPosition({
                    x: event.clientX,
                    y: event.clientY,
                });

                const newNode = {
                    id: getId(),
                    position,
                    type: 'custom',
                    data: { label: `节点 ${id}`, description: `${id}` },
                };

                addNode(newNode);
            }
        },
        [screenToFlowPosition, addNode]
    );

    const { send, generating, disabled, stop } = useSend();
    const [useCmdEnterToSend, updatePreference] = useUserStore((s) => [
        preferenceSelectors.useCmdEnterToSend(s),
        s.updatePreference,
    ]);


    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <Drawer width={640} placement="right" closable={false} onClose={onClose} open={open} mask={false}>
                {/* {chatMessages.map((message) =>
                    <ChatItem key={message.id} message={message.content} role={message.role} avatar={'default'} />
                )} */}
                {/* <ChatInputProvider
                    chatInputEditorRef={(instance) => {
                        if (!instance) return;
                        useChatStore.setState({ mainInputEditor: instance });
                    }}
                    onMarkdownContentChange={(content) => {
                        useChatStore.setState({ inputMessage: content });
                    }}
                    onSend={() => {
                        send();
                    }}
                    sendButtonProps={{ disabled, generating, onStop: stop }}
                >
                    <DesktopChatInput />
                </ChatInputProvider> */}
                <Row style={{ position: 'absolute', bottom: 24, width: '100%', padding: '0 24px' }} gutter={16}>
                    <Input
                        value={inputMessage}
                        onInput={(e) => setInputMessage(e.target.value)}
                        onPressEnter={(e) => {
                            console.log('submit', inputMessage);
                            fetchAIResponse();
                        }}
                    />
                </Row>
            </Drawer>
            <Row style={{ height: '100vh' }}>
                <Col span={20}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onPaneClick={onPaneClick}
                        onNodeClick={showDrawer}
                        fitView
                        // colorMode='dark'
                        nodeTypes={nodeTypes}
                    >
                        <Controls />
                        <MiniMap />
                        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                    </ReactFlow>
                </Col>
                <Col span={4}>
                    <TopicList />
                </Col>
            </Row>
        </div>
    );
};

export default FlowPage;