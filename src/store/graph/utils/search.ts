import { Edge } from '@xyflow/react';

import { GraphNodeMeta } from '@/types/graph';

import { nodeMapKey } from './keyMapper';

interface ChildNode {
  distance: number;
  id: string;
  meta: GraphNodeMeta;
}

export const searchChildNodesWithBFS = (
  edges: Edge[],
  nodeMetaMap: Record<string, GraphNodeMeta>,
  activeStateId: string,
  parentId: string,
): { children: ChildNode[]; edges: Edge[] } => {
  const parentMap: Map<string, string[]> = edges.reduce((map, edge) => {
    if (!map.has(edge.target)) map.set(edge.target, []);
    map.get(edge.target)!.push(edge.source);
    return map;
  }, new Map<string, string[]>());

  let activedEdges: Edge[] = [];
  // BFS to calculate distance from nodeId to all ancestor nodes
  const distances = new Map<string, number>();
  const queue: Array<{ distance: number; nodeId: string }> = [{ distance: 0, nodeId: parentId }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { nodeId, distance } = queue.shift()!;

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    distances.set(nodeId, distance);

    // Add parent nodes to queue with incremented distance
    const parents = parentMap.get(nodeId) || [];
    for (const parentId of parents) {
      if (!visited.has(parentId)) {
        queue.push({ distance: distance + 1, nodeId: parentId });
        activedEdges.push({
          id: `${parentId}-${nodeId}`,
          source: parentId,
          target: nodeId,
        });
      }
    }
  }

  // Build ChildNode array from distances (excluding the original nodeId if desired)
  const result: ChildNode[] = [];
  for (const [id, distance] of distances.entries()) {
    if (id === parentId) continue; // skip the root node itself if needed
    const meta = nodeMetaMap[nodeMapKey(activeStateId, id)];
    if (meta) {
      result.push({ distance, id, meta });
    }
  }

  return {
    children: result,
    edges: activedEdges,
  };
};
