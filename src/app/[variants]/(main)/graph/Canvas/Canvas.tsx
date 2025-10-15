'use client';

import { Dropdown, DropdownProps, Icon } from '@lobehub/ui';
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
import { BoxSelectIcon, LucideMapPinPlusInside } from 'lucide-react';
import { useCallback, useState } from 'react';

import { useFetchGraphState } from '@/hooks/useFetchGraph';
import { canvasSelectors, useGraphStore } from '@/store/graph';

import ChatNode from './ChatNode';
import TextNode from './TextNode';
import { getArrangedGraph } from './utils';

const nodeTypes = {
  chat: ChatNode,
  text: TextNode,
};

export default function Canvas() {
  useFetchGraphState();

  const { screenToFlowPosition, fitView } = useReactFlow();

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const closeMenu = () => setMenu(null);

  const [
    isInit,
    state,
    addNode,
    addEdge,
    setNodes,
    setEdges,
    onDelNodes,
    internal_updateCanvasState,
    activeStateId,
    activeNodeId,
  ] = useGraphStore((s) => [
    s.isStateInit,
    canvasSelectors.getActiveCanvasState(s),
    s.addNode,
    s.addEdge,
    s.setNodes,
    s.setEdges,
    s.onDelNodes,
    s.internal_updateCanvasState,
    s.activeStateId,
    s.activeNodeId,
  ]);

  const onNodesChange = useCallback(async (changes: NodeChange[]) => await setNodes(changes), []);
  const onEdgesChange = useCallback(async (changes: EdgeChange[]) => await setEdges(changes), []);
  const onConnect = useCallback(async (params: any) => await addEdge(params), []);
  const onNodesDelete = useCallback(async (nodes: any) => await onDelNodes(nodes), []);

  // 3. 定义 onPaneDoubleClick 回调函数

  // 双击添加节点
  const onPaneClick = useCallback(
    async (event: any) => {
      closeMenu();
      // 检查是否为双击事件
      if (event.detail === 2) {
        // 将屏幕坐标转换为流程图内部坐标
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        await addNode({ position }, { type: 'chat' });
      }
    },
    [screenToFlowPosition],
  );

  const menuItems: DropdownProps['menu'] = {
    items: [
      {
        children: [
          { key: 'CreateText', label: '文本结点' },
          { key: 'CreateChat', label: '对话结点' },
        ],
        icon: <Icon icon={LucideMapPinPlusInside} />,
        key: 'createNode',
        label: '创建结点',
      },
      {
        icon: <Icon icon={BoxSelectIcon} />,
        key: 'arrange',
        label: '整理视图',
      },
    ],
  };

  const onPaneContext = useCallback(
    (event: any) => {
      event.preventDefault();
      setMenu({ x: event.screenX, y: event.screenY });
    },
    [setMenu],
  );

  const onHandleMenuClick = useCallback(
    async (ev: any, key: string) => {
      closeMenu();
      switch (key) {
        case 'CreateText': {
          const position = screenToFlowPosition({
            x: ev.clientX,
            y: ev.clientY,
          });
          await addNode({ position, type: 'text' }, { type: 'text', useSummary: true });
          break;
        }
        case 'CreateChat': {
          const pos = screenToFlowPosition({
            x: ev.clientX,
            y: ev.clientY,
          });
          await addNode({ position: pos, type: 'chat' }, { type: 'chat' });
          break;
        }
        case 'arrange': {
          if (!state || !activeStateId) return;
          const { nodes: layoutedNodes, edges: layoutedEdges } = await getArrangedGraph(
            state.edges,
            state.nodes,
          );
          internal_updateCanvasState(activeStateId, { edges: layoutedEdges, nodes: layoutedNodes });
          if (activeNodeId) {
            const node = layoutedNodes.find((n) => n.id === activeNodeId);
            if (node) {
              // Center the view on the node
              fitView({ duration: 500, nodes: [node] });
              break;
            }
          }
          fitView({ duration: 500 });
          break;
        }
      }
      console.log('Menu click:', key);
    },
    [closeMenu],
  );

  return (
    isInit &&
    state && (
      <ReactFlow
        deleteKeyCode={['Delete']}
        edges={state.edges}
        fitView
        nodeTypes={nodeTypes}
        nodes={state.nodes}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onNodesChange={onNodesChange}
        onNodesDelete={onNodesDelete}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContext}
      >
        {menu && (
          <Dropdown
            menu={{
              items: menuItems.items,
              onClick: ({ domEvent, key }) => onHandleMenuClick(domEvent, key),
            }}
            open
            trigger={[]}
          >
            <div style={{ backgroundColor: 'red', left: menu.x, position: 'fixed', top: menu.y }} />
          </Dropdown>
        )}
        <Controls />
        <MiniMap />
        <Background gap={12} size={1} variant={BackgroundVariant.Dots} />
      </ReactFlow>
    )
  );
}
