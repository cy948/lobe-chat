'use client';

import {
    Background,
    BackgroundVariant,
    Controls,
    EdgeChange,
    MiniMap,
    NodeChange,
    ReactFlow,
    useReactFlow,
} from '@xyflow/react';
import { useCallback } from 'react';

import ChatNode from './ChatNode';
import TextNode from './TextNode';

import { canvasSelectors, useGraphStore } from '@/store/graph';
import { useFetchGraphState } from '@/hooks/useFetchGraph';

const nodeTypes = {
    chat: ChatNode,
    text: TextNode,
};

export default function Canvas() {

    useFetchGraphState();

    const [
        isInit,
        state,
        addNode,
        addEdge,
        setNodes,
        setEdges,
        onDelNodes,
    ] = useGraphStore((s) => [
        s.isStateInit,
        canvasSelectors.getActiveCanvasState(s),
        s.addNode,
        s.addEdge,
        s.setNodes,
        s.setEdges,
        s.onDelNodes,
    ])

    const onNodesChange = useCallback(async (changes: NodeChange[]) =>  await setNodes(changes), []);
    const onEdgesChange = useCallback(async (changes: EdgeChange[]) => await setEdges(changes), []);
    const onConnect = useCallback(async (params: any) => await addEdge(params), []);
    const onNodesDelete = useCallback(async (nodes: any) => await onDelNodes(nodes), []);

    // 3. 定义 onPaneDoubleClick 回调函数
    const { screenToFlowPosition } = useReactFlow();

    // 双击添加节点
    const onPaneClick = useCallback(async (event: any) => {
        // 检查是否为双击事件
        if (event.detail === 2) {
            // 将屏幕坐标转换为流程图内部坐标
            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            await addNode({ position }, { type: 'chat' });
        }
    }, [screenToFlowPosition]);

    return (
        isInit && state &&
        <ReactFlow
            deleteKeyCode={['Delete']}
            edges={state.edges}
            fitView
            nodeTypes={nodeTypes}
            nodes={state.nodes}
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onNodesChange={onNodesChange}
            onPaneClick={onPaneClick}
            onNodesDelete={onNodesDelete}
        >
            <Controls />
            <MiniMap />
            <Background gap={12} size={1} variant={BackgroundVariant.Dots} />
        </ReactFlow>
    );
}