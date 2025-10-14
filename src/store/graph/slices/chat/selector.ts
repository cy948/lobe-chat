import { GraphStore } from "../../store";

const isEditorButtonDisabled = (s: GraphStore) => isMessageGenerating(s) || s.isCreatingMessage;

const isMessageGenerating = (s: GraphStore) => (msgId: string) => s.chatLoadingIds.includes(msgId);

// const getActiveNodeLoadingIds = 

export const chatSelectors = {
  isEditorButtonDisabled,
  isMessageGenerating,
};
