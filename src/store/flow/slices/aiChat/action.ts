import { StateCreator } from "zustand/vanilla";
import { ChatMessage, CreateMessageParams, SendMessageParams } from '@/types/message';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { FlowStore } from '@/store/flow/store';
import { useChatStore } from '@/store/chat/store';
import { chatSelectors } from '@/store/chat/selectors';
import { useSessionStore } from "@/store/session";

export interface FlowAIChatAction {
  setInputMessage: (message: string) => void;
  fetchAIResponse: () => Promise<void>;
}


export const flowAIChat: StateCreator<
  FlowStore,
  [['zustand/devtools', never]],
  [],
  FlowAIChatAction
> = (set, get) => ({
  setInputMessage: (message) => {
    set({
      ...get(),
      inputMessage: message,
    });
  },
  fetchAIResponse: async () => {

    const {
      activeNodeId, activeTopicId, inputMessage,
    } = get()

    if (!activeNodeId) {
      console.warn('No active node, abort sending.');
      return
    }

    get().setInputMessage('');

    if (!inputMessage || inputMessage.trim() === '') {
      console.warn('Empty message, abort sending.');
      return;
    }

    const chatState = useChatStore.getState();

    // Set loading
    set({ ...get(), isCreateingMessage: true });

    // Get node meta
    const nodeMeta = get().getNodeMeta(activeNodeId);
    if (!nodeMeta) {
      console.warn('Node meta not found, abort sending.');
      set({ ...get(), isCreateingMessage: false });
      return;
    }

    let newMessage: CreateMessageParams = {
      content: inputMessage,
      role: 'user',
      sessionId: activeTopicId,
    }

    let tempMessageId: string | undefined = undefined;
    let newTopicId: string | undefined = undefined;


    // Auto create topic if current topic is inbox
    if (get().activeTopicId === 'inbox') {
      // Create new topic for inbox
      tempMessageId = chatState.internal_createTmpMessage(newMessage);
      chatState.internal_toggleMessageLoading(true, tempMessageId);


      const topicId = await chatState.createTopic();

      if (topicId) {
        newTopicId = topicId;
        newMessage.topicId = topicId;

        // we need to copy the messages to the new topic or the message will disappear
        const mapKey = chatSelectors.currentChatKey(chatState);
        const newMaps = {
          ...chatState.messagesMap,
          [messageMapKey(activeTopicId, topicId)]: chatState.messagesMap[mapKey],
        };

        useChatStore.setState({ messagesMap: newMaps });

        // make the topic loading
        chatState.internal_updateTopicLoading(topicId, true);
      }
    }

    //  update assistant update to make it rerank
    useSessionStore.getState().triggerSessionUpdate(activeTopicId);

    const id = await chatState.internal_createMessage(newMessage, {
      tempMessageId,
    });

    if (!id) {
      set({ ...get(), isCreateingMessage: false });
      if (!!newTopicId) chatState.internal_updateTopicLoading(newTopicId, false);
      return;
    }

    if (tempMessageId)
      chatState.internal_toggleMessageLoading(false, tempMessageId);

    // switch to the new topic if create the new topic
    if (!!newTopicId) {
      set({ ...get(), activeTopicId: newTopicId });
      await chatState.internal_fetchMessages();

      // delete previous messages
      // remove the temp message map
      const newMaps = { ...chatState.messagesMap, [messageMapKey(activeTopicId, null)]: [] };
      useChatStore.setState({ messagesMap: newMaps }, false, 'internal_copyMessages');
    }

    // Get the current messages to generate AI response
    // TODO: build chat graph here
    // Get message from current node
    const nodeMessages = nodeMeta.messages

    const graphMessages: ChatMessage[] = []

    const mergeMessages = [...nodeMessages, ...graphMessages]

    // TODO: fetch AI response here
    // await chatState.internal_coreProcessMessage(mergeMessages, id, {});

    set({ ...get(), isCreateingMessage: false });

  },
})