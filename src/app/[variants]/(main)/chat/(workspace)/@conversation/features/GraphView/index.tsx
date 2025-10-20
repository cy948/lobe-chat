'use client';

import { ReactFlow, Node, Edge, ReactFlowProvider, XYPosition } from '@xyflow/react'
import '@xyflow/react/dist/style.css';

import WideScreenContainer from '@/features/Conversation/components/WideScreenContainer';
import ChatNode from './ChatNode';
import { useFetchMessages } from '@/hooks/useFetchMessages';
import { useChatStore } from '@/store/chat';
import { chatSelectors, threadSelectors } from '@/store/chat/selectors';
import { ChatMessage } from '@/types/message';
import { Flexbox } from 'react-layout-kit';
import { createStyles } from 'antd-style';

import ELK, { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js';
import { useCallback, useEffect, useState } from 'react';

const elk = new ELK();

interface MessagePair {
    id: string;
    userMessage: ChatMessage;
    assistantMessage?: ChatMessage;
    parentId?: string;
    children: string[];
}

const nodeTypes = {
    chat: ChatNode,
};

const useStyles = createStyles(({ token }) => {
    return {
        flow: {
            backgroundColor: token.colorBgBase
        }
    };
});

const elkOptions = {
    'elk.algorithm': 'layered',
    // 层间距：基于节点宽度(360)的 0.8-1.2 倍较合适
    'elk.layered.spacing.nodeNodeBetweenLayers': '320',
    // 不连通分量间距：给予更大空间区分不同子图
    'elk.spacing.componentComponent': '240',
    // 同层节点间距：基于节点高度(240)的 0.6-0.8 倍
    'elk.spacing.nodeNode': '240',
    // 边距：给画布留白
    'elk.padding': '[top=80,left=80,bottom=80,right=80]',
    // 层内节点对齐
    'elk.layered.nodePlacement.strategy': 'SIMPLE',
    // 边的间距，避免边重叠
    'elk.layered.spacing.edgeEdgeBetweenLayers': '40',
    'elk.layered.spacing.edgeNodeBetweenLayers': '80',
} as const;



export default function GraphView() {

    const { styles } = useStyles();

    const [isCurrentChatLoaded] = useChatStore((s) => [chatSelectors.isCurrentChatLoaded(s)]);

    useFetchMessages();
    const data = useChatStore(chatSelectors.activeBaseChats);

    console.log('data', data);

    const threads = useChatStore(threadSelectors.currentTopicThreads);

    console.log('threads', threads);

    const getGraph = useCallback(async (messages: ChatMessage[]): Promise<{ nodes: Node[]; edges: Edge[] }> => {
        const nodes: Node[] = [];
        const edges: Edge[] = [];

        // Group messages into pairs (user message + assistant message)
        const messagePairs: MessagePair[] = [];
        const messageMap = new Map<string, ChatMessage>();

        // Create a map for quick lookup
        messages.forEach(msg => messageMap.set(msg.id, msg));

        const userQueryIds = messages.filter(msg => msg.role === 'assistant' && !msg.threadId).map(msg => msg.id);

        let parentId: string | undefined = undefined


        userQueryIds.forEach((userMsgId, index) => {
            nodes.push({
                id: userMsgId,
                type: 'chat',
                position: { x: nodes.length * 400, y: 150 },
                data: { id: userMsgId },
            });

            if (parentId) {
                edges.push({
                    source: parentId,
                    target: userMsgId,
                    animated: true,
                    id: `e${parentId}-${userMsgId}`,
                })
            }
            parentId = userMsgId;

        });

        threads.forEach((thread, index) => {
            const threadMessages = messages.filter(m => m.threadId === thread.id).filter(m => m.role === 'assistant');
            let parentId: string | undefined = undefined
            let firstMsg: string | undefined = undefined

            // 先建立 Thread 结点的分支

            threadMessages.forEach(msg => {
                if (!firstMsg) firstMsg = msg.id;

                nodes.push({
                    id: msg.id,
                    type: 'chat',
                    position: { x: nodes.length * 400, y: 150 },
                    data: {
                        id: msg.id,
                    },
                });

                if (parentId) {
                    edges.push({
                        source: parentId,
                        target: msg.id,
                        animated: true,
                        id: `e${parentId}-${msg.id}`,
                    });
                }
                parentId = msg.id;
            });

            // 最后再连接 Thread 结点与主线结点

            if (thread.sourceMessageId) {
                edges.push({
                    source: thread.sourceMessageId,
                    target: firstMsg || '',
                    animated: true,
                    id: `e${thread.sourceMessageId}-${thread.id}`,
                });
            }
        });

        const dir = 'RIGHT'

        const isHorizontal = dir === 'RIGHT';

        // 1) 将 RF nodes 映射为 ELK children（必须有 width/height）
        const elkChildren: NonNullable<ElkNode['children']> = nodes.map((n) => ({
            height: (n as Node).measured?.height ?? 50,

            id: n.id,

            // 可选：附带标签或数据，但 ELK 只关心布局
            labels: n.data?.label ? [{ text: String(n.data.label) }] : undefined,

            // 若有测量尺寸可用 n.measured?.width/height，否则给默认值
            width: (n as Node).measured?.width ?? 150,
        }));

        const exixtedNodes = nodes.reduce(
            (acc, node) => {
                acc[node.id] = true;
                return acc;
            },
            {} as Record<string, boolean>,
        );

        // 2) 将 RF edges 映射为 ELK edges（关键：sources/targets 数组）
        const elkEdges: ElkExtendedEdge[] = edges
            // 过滤掉源/目标节点不存在的边
            .filter((e) => exixtedNodes[e.source] && exixtedNodes[e.target])
            .map((e: Edge) => ({
                id: e.id,
                sources: [e.source],
                targets: [e.target],
            }));

        // 3) 组织 ELK graph
        const graph: ElkNode = {
            children: elkChildren,
            edges: elkEdges,
            id: 'root',
            layoutOptions: { 'elk.direction': dir, ...elkOptions },
        };

        // 4) 运行布局
        const res = await elk.layout(graph);

        // 5) 将 ELK 的 x/y 回填为 React Flow 的 position，保留原节点的其他属性
        const posById = new Map<string, XYPosition>(
            (res.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]),
        );

        const layoutedNodes: Node[] = nodes.map((n) => {
            const p = posById.get(n.id) ?? { x: 0, y: 0 };
            return {
                ...n,
                position: p,
                sourcePosition: isHorizontal ? 'right' : 'bottom',
                targetPosition: isHorizontal ? 'left' : 'top',
                // 注意：React Flow 由 position 驱动，不需要再带 x/y
            } as Node;
        });

        // edges 保持 React Flow 结构即可（样式/交互仍由 RF 控制）
        return { edges, nodes: layoutedNodes };
    }, [threads]);

    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);

    const computeGraph = useCallback(async (msgs: ChatMessage[] = []) => {
        if (!msgs || msgs.length === 0) {
            setNodes([]);
            setEdges([]);
            return;
        }
        try {
            const { nodes: newNodes, edges: newEdges } = await getGraph(msgs);
            setNodes(newNodes);
            setEdges(newEdges);
        } catch (err) {
            console.error('computeGraph error', err);
        }
    }, [getGraph]);

    useEffect(() => {
        computeGraph(data);
    }, [data, computeGraph]);

    return (
        <Flexbox height={'100%'}>
            <ReactFlowProvider>
                <ReactFlow
                    className={styles.flow}
                    colorMode='dark'
                    nodeTypes={nodeTypes}
                    nodes={nodes}
                    edges={edges}
                    fitView
                >
                </ReactFlow>
            </ReactFlowProvider>
        </Flexbox >
    )
}