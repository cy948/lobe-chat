import { ChatMessage } from "@/types/message";
import { GraphStore } from "../../store";
import { messageMapKey } from "../../utils";

export const getNodeMessages = (s: GraphStore) => (nodeId: string) : ChatMessage[] | undefined => {
    if (!s.activeStateId) return undefined;
    return s.messagesMap[messageMapKey(s.activeStateId, nodeId)];
}

export const getActiveNodeMessages = (s: GraphStore) : ChatMessage[] | undefined => {
    if (!s.activeStateId || !s.activeNodeId) return undefined;
    return s.messagesMap[messageMapKey(s.activeStateId, s.activeNodeId)];
}

export const getActiveNodeMessageIds = (s: GraphStore) : string[] | undefined => {
    if (!s.activeStateId || !s.activeNodeId) return undefined;
    const messages = s.messagesMap[messageMapKey(s.activeStateId, s.activeNodeId)];
    if (!messages) return undefined;
    return messages.map((msg) => msg.id);
}

export const getActiveNodeMessageById = (s: GraphStore) => (messageId: string) : ChatMessage | undefined => {
    const messages = getActiveNodeMessages(s);
    if (!messages) return undefined;
    return messages.find((msg) => msg.id === messageId);
}

export const isMessageLoading = (s: GraphStore) => (msgId: string) => s.messageLoadingIds.includes(msgId);

export const isMessageEditing = (s: GraphStore) => (msgId: string) => s.messageEditingIds.includes(msgId);

export const messageSelectors = {
    getNodeMessages,
    getActiveNodeMessageById,
    getActiveNodeMessages,
    getActiveNodeMessageIds,
    isMessageLoading,
    isMessageEditing,
};
