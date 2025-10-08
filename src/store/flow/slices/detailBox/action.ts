import { StateCreator } from 'zustand/vanilla';
import { FlowStore } from '@/store/flow/store';
import { toggleBooleanList } from '@/store/chat/utils';

export interface FlowDetailBoxAction {
    setDetailBoxVisible: (visible: boolean) => void;
    openInDetailBox: (nodeId: string) => void;
    updateInputMessage: (message: string) => void;
    updateInputSummary: (summary: string) => void;
    updateSummaryTitle: (title: string) => void;
    modifyMessageContent: (id: string, content: string) => Promise<void>;
    toggleMessageEditing: (id: string, editing: boolean) => void;
}

export const flowDetailBox: StateCreator<
    FlowStore,
    [['zustand/devtools', never]],
    [],
    FlowDetailBoxAction
> = (set, get) => ({
    setDetailBoxVisible(visible) {
        set({ ...get(), detailBoxVisible: visible });
    },
    openInDetailBox(nodeId) {
        // Open the detail box for the specified node
        console.log('Opening detail box for node:', nodeId, ' in topicId: ', get().activeTopicId);
        // TODO: fetch messages then set inited
        set({ ...get(), activeNodeId: nodeId, detailBoxVisible: true, isDetailBoxInitialized: true });
        // TODO: should fetch messages
        set({ ...get(), messagesInit: true });
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
            get().setNodeMeta(activeNodeId, {
                ...nodeMeta,
                summary,
            })
        }
    },
    updateSummaryTitle(title) {
        const { activeNodeId, getNodeMeta, setNodeMeta } = get();
        if (!activeNodeId) return;
        const nodeMeta = getNodeMeta(activeNodeId);
        if (nodeMeta) {
            get().setNodeMeta(activeNodeId, {
                ...nodeMeta,
                title,
            })
        }
    },
    toggleMessageEditing: (id, editing) => {
        set(
            { messageEditingIds: toggleBooleanList(get().messageEditingIds, id, editing) },
            false,
            'toggleMessageEditing',
        );
    },
    modifyMessageContent: async (id, content) => {
        await get().internal_updateMessageContent(id, content);
    },
})