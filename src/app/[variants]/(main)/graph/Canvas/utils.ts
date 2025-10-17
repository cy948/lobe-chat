'use client';

import type { Edge as RFEdge, Node as RFNode, XYPosition } from '@xyflow/react';
import ELK, { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js';

// TODO: should use lazyload in browser only environment
const elk = new ELK();

// 宽松

// const elkOptions = {
//   'elk.algorithm': 'layered',
//   // 层间距：基于节点宽度(360)的 0.8-1.2 倍较合适
//   'elk.layered.spacing.nodeNodeBetweenLayers': '320',
//   // 不连通分量间距：给予更大空间区分不同子图
//   'elk.spacing.componentComponent': '240',
//   // 同层节点间距：基于节点高度(240)的 0.6-0.8 倍
//   'elk.spacing.nodeNode': '160',
//   // 边距：给画布留白
//   'elk.padding': '[top=80,left=80,bottom=80,right=80]',
//   // 层内节点对齐
//   'elk.layered.nodePlacement.strategy': 'SIMPLE',
//   // 边的间距，避免边重叠
//   'elk.layered.spacing.edgeEdgeBetweenLayers': '40',
//   'elk.layered.spacing.edgeNodeBetweenLayers': '80',
// } as const;

const elkOptions = {
  'elk.algorithm': 'layered',
  // 层内节点对齐
  'elk.layered.nodePlacement.strategy': 'SIMPLE',
  // 边的间距：最小化
  'elk.layered.spacing.edgeEdgeBetweenLayers': '20',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  // 层间距：节点宽度(360)的 0.5 倍，紧凑布局
  'elk.layered.spacing.nodeNodeBetweenLayers': '180',
  // 边距：减少留白
  'elk.padding': '[top=40,left=40,bottom=40,right=40]',
  // 不连通分量间距：节点高度(240)的 0.5 倍
  'elk.spacing.componentComponent': '120',
  // 同层节点间距：节点高度(240)的 0.3 倍
  'elk.spacing.nodeNode': '72',
} as const;

type Direction = 'RIGHT' | 'DOWN';

export const getArrangedGraph = async (
  edges: RFEdge[],
  nodes: RFNode[],
  dir: Direction = 'RIGHT',
) => {
  const isHorizontal = dir === 'RIGHT';

  // 1) 将 RF nodes 映射为 ELK children（必须有 width/height）
  const elkChildren: NonNullable<ElkNode['children']> = nodes.map((n) => ({
    height: (n as RFNode).measured?.height ?? 50,

    id: n.id,

    // 可选：附带标签或数据，但 ELK 只关心布局
    labels: n.data?.label ? [{ text: String(n.data.label) }] : undefined,

    // 若有测量尺寸可用 n.measured?.width/height，否则给默认值
    width: (n as RFNode).measured?.width ?? 150,
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
    .map((e: RFEdge) => ({
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

  const layoutedNodes: RFNode[] = nodes.map((n) => {
    const p = posById.get(n.id) ?? { x: 0, y: 0 };
    return {
      ...n,
      position: p,
      sourcePosition: isHorizontal ? 'right' : 'bottom',
      targetPosition: isHorizontal ? 'left' : 'top',
      // 注意：React Flow 由 position 驱动，不需要再带 x/y
    } as RFNode;
  });

  // edges 保持 React Flow 结构即可（样式/交互仍由 RF 控制）
  return { edges, nodes: layoutedNodes };
};
