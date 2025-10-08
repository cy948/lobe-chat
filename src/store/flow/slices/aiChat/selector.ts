import type { FlowStore } from '@/store/flow'

import { canvasSelectors } from '../canvas/selector'

const isFlowAIGenerating = (s: FlowStore) =>
  s.chatLoadingIds.some((id) => canvasSelectors.getActiveNodeMessageIds(s).includes(id));

const isEditorButtonDisabled = (s: FlowStore) =>
  isFlowAIGenerating(s) || s.isCreatingMessage;

const isMessageGenerating = (id: string) => (s: FlowStore) =>
  s.chatLoadingIds.includes(id);

export const flowAIChatSelectors = {
    isFlowAIGenerating,
    isEditorButtonDisabled,
    isMessageGenerating,
}