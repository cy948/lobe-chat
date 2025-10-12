import { StateCreator } from 'zustand/vanilla';

import { toggleBooleanList } from '@/store/chat/utils';
import { FlowStore } from '@/store/flow/store';

export interface FlowDetailBoxAction {
  modifyMessageContent: (id: string, content: string) => Promise<void>;
  openInDetailBox: (nodeId: string) => void;
  setDetailBoxVisible: (visible: boolean) => void;
  toggleMessageEditing: (id: string, editing: boolean) => void;
  updateInputMessage: (message: string) => void;
  updateInputSummary: (summary: string) => void;
  updateSummaryTitle: (title: string) => void;
}

export const flowDetailBox: StateCreator<
  FlowStore,
  [['zustand/devtools', never]],
  [],
  FlowDetailBoxAction
> = (set, get) => ({
  modifyMessageContent: async (id, content) => {
    await get().internal_updateMessageContent(id, content);
  },
  openInDetailBox(nodeId) {
    // Open the detail box for the specified node
    console.log('Opening detail box for node:', nodeId, 'in topicId:', get().activeTopicId);
    // TODO: fetch messages then set inited
    set({ ...get(), activeNodeId: nodeId, detailBoxVisible: true, isDetailBoxInitialized: true });
    // TODO: should fetch node meta
    set({ ...get(), messagesInit: true });
  },
  setDetailBoxVisible(visible) {
    set({ ...get(), detailBoxVisible: visible });
  },
  toggleMessageEditing: (id, editing) => {
    set(
      { messageEditingIds: toggleBooleanList(get().messageEditingIds, id, editing) },
      false,
      'toggleMessageEditing',
    );
  },
  updateInputMessage(message) {
    set({ ...get(), inputMessage: message });
  },
  updateInputSummary(summary) {
    set({ ...get(), inputSummary: summary });
    // Set node meta
    const { activeNodeId, getNodeMeta, setNodeMeta } = get();
    if (!activeNodeId) return;
    const nodeMeta = getNodeMeta(activeNodeId);
    if (nodeMeta) {
      setNodeMeta(activeNodeId, {
        ...nodeMeta,
        summary,
      });
    }
  },
  updateSummaryTitle(title) {
    const { activeNodeId, getNodeMeta } = get();
    if (!activeNodeId) return;
    const nodeMeta = getNodeMeta(activeNodeId);
    if (nodeMeta) {
      get().setNodeMeta(activeNodeId, {
        ...nodeMeta,
        title,
      });
    }
  },
});
