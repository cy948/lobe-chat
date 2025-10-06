'use client';

import { useState, useCallback } from 'react';

import {
    ReactFlow,
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    useReactFlow
} from '@xyflow/react';

import { Row, Col, Input } from 'antd'
import { createStyles } from 'antd-style';

import { useFlowStore } from '@/store/flow';

import CustomNode from './ChatNode';

export let id = 1;
const getId = () => `node_${id++}`;

const nodeTypes = { custom: CustomNode };

const useStyles = createStyles(({ css, token, isDarkMode }) => {
    return {
        canvasContainer: {
            width: '100vw',
            height: '100vh',
            background: isDarkMode ? token.colorBgContainer : '#f0f2f5',
        },
        canvasBox: {
            height: '100vh',
        },
        chatBoxInput: {
            position: 'absolute',
            bottom: 24,
            width: '100%',
            padding: '0 24px',
        }
    }
});


const FlowPage = () => {
    const { styles } = useStyles();
    const [
        edges, nodes, addNode, addEdge, setNodes, setEdges, delNode, showNodeDetailDrawer,
        inputMessage, setInputMessage, fetchAIResponse, loadTopic, setActiveNode,
    ] = useFlowStore(
        s => [
            s.edges, s.nodes, s.addNode, s.addEdge, s.setNodes, s.setEdges, s.delNode, s.showNodeDetailDrawer,
            s.inputMessage, s.setInputMessage, s.fetchAIResponse, s.loadTopic, s.setActiveNode,
        ]
    );

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

    return (
        <div className={styles.canvasContainer}>
            <Row className={styles.canvasBox} gutter={16}>
                <Col span={showNodeDetailDrawer ? 16 : 24}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onPaneClick={onPaneClick}
                        fitView
                        // colorMode='dark'
                        nodeTypes={nodeTypes}
                    >
                        <Controls />
                        <MiniMap />
                        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                    </ReactFlow>
                </Col>
                <Col span={showNodeDetailDrawer ? 8 : 0}>
                    {showNodeDetailDrawer &&
                        <Row className={styles.chatBoxInput} gutter={16}>
                            <Input
                                value={inputMessage}
                                onInput={(e) => setInputMessage(e.target.value)}
                                onPressEnter={() => {
                                    fetchAIResponse();
                                }}
                            />
                        </Row>}
                </Col>
            </Row>
        </div>
    );
};

export default FlowPage;