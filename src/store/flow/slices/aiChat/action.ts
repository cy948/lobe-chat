import { StateCreator } from "zustand/vanilla";
import { ChatMessage, CreateMessageParams } from '@/types/message';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { FlowStore } from '@/store/flow/store';
import { useChatStore } from '@/store/chat/store';
import { useSessionStore } from "@/store/session";
import { messageService } from "@/services/message";
import { LOADING_FLAT } from "@/const/index";
import { getAgentStoreState } from "@/store/agent";
import { agentSelectors } from "@/store/agent/selectors";

export interface FlowAIChatAction {
  setInputMessage: (message: string) => void;

  sendMessage: () => Promise<void>;
  fetchMessages: () => Promise<void>;

  internal_createMessage: (params: any, context: { tempMessageId?: string }) => Promise<void>;
  internal_fetchAIResponse: () => Promise<void>;
  internal_coreProcessMessage: (messages: ChatMessage[], messageId: string, options: any) => Promise<void>;
}


export const flowAIChat: StateCreator<
  FlowStore,
  [['zustand/devtools', never]],
  [],
  FlowAIChatAction
> = (set, get) => ({
  sendMessage: async () => {

    const {
      activeNodeId, activeSessionId, activeTopicId, inputMessage, 
      internal_coreProcessMessage, internal_createMessage, internal_fetchAIResponse,
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
      sessionId: activeSessionId,
    }

    let tempMessageId: string | undefined = undefined;
    let newTopicId: string | undefined = undefined;


    // Auto create topic if current topic is inbox
    if (activeSessionId === 'inbox') {
      // Create new topic for inbox
      tempMessageId = chatState.internal_createTmpMessage(newMessage);
      chatState.internal_toggleMessageLoading(true, tempMessageId);


      const topicId = await chatState.createTopic();

      if (topicId) {
        newTopicId = topicId;
        newMessage.topicId = topicId;

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
      const newMaps = { ...chatState.messagesMap, [messageMapKey(activeSessionId, activeTopicId)]: [] };
      useChatStore.setState({ messagesMap: newMaps }, false, 'internal_copyMessages');
    }

    // Get the current messages to generate AI response
    // TODO: build chat graph here
    // Get message from current node
    const nodeMessages = nodeMeta.messages

    const graphMessages: ChatMessage[] = []

    const mergeMessages = [...nodeMessages, ...graphMessages]

    // TODO: fetch AI response here
    await internal_coreProcessMessage(mergeMessages, id, {});

    set({ ...get(), isCreateingMessage: false });

  },
  fetchMessages: async () => {
    // fetch messages for all nodes
    const { activeTopicId, nodeMetaMap } = get();
    const messages = await messageService.getMessages('', activeTopicId)
  },
  setInputMessage: (message) => {
    set({
      ...get(),
      inputMessage: message,
    });
  },
  internal_createMessage: async (params, context) => {
  },
  internal_coreProcessMessage: async (messages: ChatMessage[], userMessageId: string, params?: any) => {
    const { activeSessionId, activeTopicId, internal_fetchAIResponse } = get();

    const agentStoreState = getAgentStoreState();
    const { model, provider, chatConfig } = agentSelectors.currentAgentConfig(agentStoreState);

    const assistantMessage: CreateMessageParams = {
      role: 'assistant',
      content: LOADING_FLAT,
      fromModel: model,
      fromProvider: provider,

      parentId: userMessageId,
      sessionId: activeSessionId,
      topicId: activeTopicId, // if there is activeTopicId，then add it to topicId
    };

    const assistantId = await internal_createMessage(assistantMessage);

    if (!assistantId) return;

    // 4. fetch the AI response
    const { isFunctionCall, content } = await internal_fetchAIChatMessage({
      messages,
      messageId: assistantId,
      params,
      model,
      provider: provider!,
    });
  },
  internal_fetchAIResponse: async () => {
    const { activeTopicId, nodeMetaMap } = get();
    const messages = await messageService.getMessages('', activeTopicId)
  },
})