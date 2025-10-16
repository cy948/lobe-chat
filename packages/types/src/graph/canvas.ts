import type { Edge, Node } from '@xyflow/react';

import { ChatMessage } from '../message';

export type CanvasState = {
  edges: Edge[];
  nodes: Node[];
};

export type GraphNodeMeta = {
  isLatestSummary?: boolean;
  summary?: string;
  title?: string;
  type: 'text' | 'chat';
  useSummary?: boolean;
};

export type GraphNode = {
  id: string;
  messages?: ChatMessage[];
  meta: GraphNodeMeta;
};

export type GraphState = {
  id: string;
  nodes: GraphNode[];
  state: CanvasState;
};

export type GraphTopic = {
  favorite: boolean;
  id: string;
  title: string;
};
