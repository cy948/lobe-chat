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

import { useFlowStore } from '@/store/flow';

import CustomNode from './ChatNode';
import { useFetchFlowState } from '@/hooks/useFetchFlow';

const nodeTypes = { custom: CustomNode };

export default function FlowCanvas() {

  useFetchFlowState();

  const [edges, nodes, addNode, addEdge, setNodes, setEdges] = useFlowStore((s) => [
    s.edges,
    s.nodes,
    s.addNode,
    s.addEdge,
    s.setNodes,
    s.setEdges,
  ]);

  const onNodesChange = useCallback(async (changes: NodeChange[]) => await setNodes(changes), []);
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
  };

  return (
    <ReactFlow
      deleteKeyCode={['Delete']}
      edges={edges}
      fitView
      nodeTypes={nodeTypes}
      nodes={nodes}
      onConnect={onConnect}
      onEdgesChange={onEdgesChange}
      onNodesChange={onNodesChange}
      onPaneClick={onPaneClick}
    >
      <Controls />
      <MiniMap />
      <Background gap={12} size={1} variant={BackgroundVariant.Dots} />
    </ReactFlow>
  );
}
