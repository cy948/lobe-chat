'use client';

import { useState, useCallback } from 'react';
import { Flexbox } from 'react-layout-kit'

import { ReactFlow, applyNodeChanges, applyEdgeChanges, addEdge, Handle, Position, useReactFlow } from '@xyflow/react';

import { Card, Drawer, Row, Col } from 'antd'
import { Markdown, MarkdownProps } from '@lobehub/ui';
import { AssistantMessage } from '@/features/Conversation/Messages/Assistant';
import { ChatMessage } from '@/types/message';
import ChatItem from '@/features/ChatItem';
import { ChatInputProvider, DesktopChatInput } from '@/features/ChatInput';


import { useFetchMessages } from '@/hooks/useFetchMessages';

import { useChatStore } from '@/store/chat';
import { aiChatSelectors, chatSelectors } from '@/store/chat/selectors';
import { useUserStore } from '@/store/user';
import { preferenceSelectors, settingsSelectors } from '@/store/user/selectors';
import { createStyles } from 'antd-style';

import { useSend } from 'src/app/[variants]/(main)/chat/(workspace)/@conversation/features/ChatInput/useSend';
import TopicList from 'src/app/[variants]/(main)/chat/(workspace)/@topic/features/TopicListContent'

const useStyles = createStyles(({ css, token, isDarkMode }) => {
    return {
        flowNode: {
            header: css`
                background: ${token.colorInfoBg}
            `
        }
    }
});



const chatMessages: ChatMessage[] = [
    {
        id: '2',
        content: 'Query from Topic1？',
        role: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        meta: {}
    },
    {
        id: '3',
        content: 'Long anwser from topic 1',
        role: 'assistant',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        meta: {}
    }
];

let id = 1;
const getId = () => `node_${id++}`;

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

    function CustomNode({ data }) {
        return (
            <Card className={styles.flowNode}>
                <Handle type="target" position={Position.Left} />
                <strong>{data.label}</strong>
                <Markdown>
                    {data.description}
                </Markdown>
                <Handle type="source" position={Position.Right} />
            </Card>
        );
    }

    const nodeTypes = { custom: CustomNode };

    // const initialNodes = [
    //     { id: 'n1', type: 'custom', position: { x: 0, y: 0 }, data: { label: 'Topic 1', description: '*summary1*' } },
    //     { id: 'n2', type: 'custom', position: { x: 300, y: 100 }, data: { label: 'Topic 2', description: '**summary2**' } },
    // ];

    const initialNodes = messages.map((message, index) => ({
        id: message.id,
        type: 'custom',
        data: { label: `Message ${index + 1}`, description: message.content },
        position: { x: index * 50, y: index * 50 },
    }))

    console.log('initialNodes', initialNodes)

    const initialEdges = [];

    const [nodes, setNodes] = useState(initialNodes);
    const [edges, setEdges] = useState(initialEdges);
    const [open, setOpen] = useState(false);

    // useCallback(() => {
    //     setNodes(messages.map((message, index) => ({
    //         id: message.id,
    //         type: 'custom',
    //         data: { label: `Message ${index + 1}`, description: message.content },
    //         position: { x: index * 50, y: index * 50 },
    //     })))
    // }, [messages])

    const showDrawer = () => {
        setOpen(true);
    };

    const onClose = () => {
        setOpen(false);
    };


    const onNodesChange = useCallback(
        (changes) => setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
        [],
    );
    const onEdgesChange = useCallback(
        (changes) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
        [],
    );
    const onConnect = useCallback(
        (params) => setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
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

                setNodes((nds) => [...nds, newNode]);
            }
        },
        [screenToFlowPosition, setNodes]
    );

    const { send, generating, disabled, stop } = useSend();
    const [useCmdEnterToSend, updatePreference] = useUserStore((s) => [
        preferenceSelectors.useCmdEnterToSend(s),
        s.updatePreference,
    ]);


    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <Drawer width={640} placement="right" closable={false} onClose={onClose} open={open} mask={false}>
                {chatMessages.map((message) =>
                    <ChatItem key={message.id} message={message.content} role={message.role} avatar={'default'} />
                )}
                <ChatInputProvider
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
                </ChatInputProvider>
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
                        colorMode='dark'
                        nodeTypes={nodeTypes}
                    />
                </Col>
                <Col span={4}>
                    <TopicList />
                </Col>
            </Row>
        </div>
    );
};

export default FlowPage;