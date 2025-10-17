import { GraphStore } from '../../store';
import { messageMapKey } from '../../utils';

const isMessageGenerating = (s: GraphStore) => (msgId: string) => s.chatLoadingIds.includes(msgId);

const isNodeMessageGenerating = (s: GraphStore) => {
  if (!s.activeNodeId || !s.activeStateId) return false;
  const messages = s.messagesMap[messageMapKey(s.activeStateId, s.activeNodeId)];
  if (!messages || messages.length === 0) return false;
  const msgIds = new Set(messages.map((msg) => msg.id));
  return s.chatLoadingIds.some((id) => msgIds.has(id));
};

const isEditorButtonDisabled = (s: GraphStore) => isNodeMessageGenerating(s) || s.isCreatingMessage;

// const getActiveNodeLoadingIds =

export const chatSelectors = {
  isEditorButtonDisabled,
  isMessageGenerating,
  isNodeMessageGenerating,
};
