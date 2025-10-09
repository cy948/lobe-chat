'use client';
import { useCallback } from 'react';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    useReactFlow,
    NodeChange,
    EdgeChange,
} from '@xyflow/react';
import { useFlowStore } from '@/store/flow';

import CustomNode from './ChatNode';

const nodeTypes = { custom: CustomNode };

export default function FlowCanvas() {
    const [
        edges,
        nodes,
        addNode,
        addEdge,
        setNodes,
        setEdges,
        delNode,
    ] = useFlowStore(s => [
        s.edges,
        s.nodes,
        s.addNode,
        s.addEdge,
        s.setNodes,
        s.setEdges,
        s.delNode,
    ]);

    const onNodesChange = useCallback((changes: NodeChange[]) => setNodes(changes), []);
    const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges(changes), []);
    const onConnect = useCallback((params: any) => addEdge(params), []);
    // const onNodesDelete = useCallback((nodes: Node[]) => {
    //     if (deleted && deleted.length > 0) {
    //         delNode(deleted[0].id);
    //     }
    // }, [])

    // 3. 定义 onPaneDoubleClick 回调函数
    const { screenToFlowPosition } = useReactFlow();

    // 双击添加节点
    const onPaneClick = async (event: any) => {
        // 检查是否为双击事件
        if (event.detail === 2) {
            // 将屏幕坐标转换为流程图内部坐标
            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            await addNode({ position });
        }
    }

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onPaneClick={onPaneClick}
            fitView
            nodeTypes={nodeTypes}
            deleteKeyCode={['Delete']}
            // onNodesDelete={onNodesDelete}
        >
            <Controls />
            <MiniMap />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>
    );
}