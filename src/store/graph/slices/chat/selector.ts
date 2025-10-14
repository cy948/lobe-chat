import { GraphStore } from "../../store";
import { messageMapKey } from "../../utils";

const isEditorButtonDisabled = (s: GraphStore) => isMessageGenerating(s) || s.isCreatingMessage;

const isMessageGenerating = (s: GraphStore) => (msgId: string) => s.chatLoadingIds.includes(msgId);

const isNodeMessageGenerating = (s: GraphStore) => {
    if (!s.activeNodeId || !s.activeStateId) return false;
    const messages = s.messagesMap[messageMapKey(s.activeStateId, s.activeNodeId)];
    if (!messages || messages.length === 0) return false;
    const msgIds = messages.map((msg) => msg.id);
    return s.chatLoadingIds.some((id) => msgIds.includes(id));
}

// const getActiveNodeLoadingIds = 

export const chatSelectors = {
    isEditorButtonDisabled,
    isMessageGenerating,
    isNodeMessageGenerating,
};
