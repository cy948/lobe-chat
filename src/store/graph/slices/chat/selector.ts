import { GraphStore } from '../../store';
import { messageMapKey } from '../../utils';

const isMessageGenerating = (s: GraphStore) => (msgId: string) => s.chatLoadingIds.includes(msgId);

const isEditorButtonDisabled = (s: GraphStore) => isMessageGenerating(s) || s.isCreatingMessage;

const isNodeMessageGenerating = (s: GraphStore) => {
  if (!s.activeNodeId || !s.activeStateId) return false;
  const messages = s.messagesMap[messageMapKey(s.activeStateId, s.activeNodeId)];
  if (!messages || messages.length === 0) return false;
  const msgIds = new Set(messages.map((msg) => msg.id));
  return s.chatLoadingIds.some((id) => msgIds.has(id));
};

// const getActiveNodeLoadingIds =

export const chatSelectors = {
  isEditorButtonDisabled,
  isMessageGenerating,
  isNodeMessageGenerating,
};
