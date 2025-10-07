import type { FlowStore } from '@/store/flow'

import { canvasSelectors } from '../canvas/selector'

const isFlowAIGenerating = (s: FlowStore) =>
  s.chatLoadingIds.some((id) => canvasSelectors.getActiveNodeMessageIds(s).includes(id));

export const flowAIChatSelectors = {
    isFlowAIGenerating,
}