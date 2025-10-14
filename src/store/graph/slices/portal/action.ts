import { type Edge } from '@xyflow/react';
import { StateCreator } from 'zustand/vanilla';

import { GraphStore } from '@/store/graph';

import { searchChildNodesWithBFS } from '../../utils';

export interface GraphPortalAction {
  openNodePortal: (nodeId: string) => void;
  setPortal: (show: boolean) => void;
  updateInputMessage: (message: string) => void;
  updateInputSummary: (summary: string) => void;
}

export const graphPortal: StateCreator<
  GraphStore,
  [['zustand/devtools', never]],
  [],
  GraphPortalAction
> = (set, get) => ({
  openNodePortal: (nodeId) => {
    const { stateMap, activeStateId, nodeMetaMap, internal_updateCanvasState } = get();
    if (!activeStateId) return;
    const state = stateMap[activeStateId];
    if (!state) return;
    const { edges } = state;
    set({ activeNodeId: nodeId, showPortal: true });
    const { edges: activatedEdges } = searchChildNodesWithBFS(
      edges,
      nodeMetaMap,
      activeStateId,
      nodeId,
    );
    const newEdges = edges.map((edge) => {
      if (activatedEdges.some((e) => e.source === edge.source && e.target === edge.target)) {
        return { ...edge, animated: true } as Edge;
      }
      return { ...edge, animated: false } as Edge;
    });
    // Only trigger internal update
    internal_updateCanvasState(activeStateId, { edges: newEdges });
  },
  setPortal: (show) => {
    set({ showPortal: show });
  },
  updateInputMessage: (message) => {
    set({ inputMessage: message });
  },
  updateInputSummary: (summary) => {
    set({ inputSummary: summary });
  },
});
