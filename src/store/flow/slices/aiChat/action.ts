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
import { nanoid } from "node_modules/@lobechat/model-runtime/src/utils/uuid";

export interface FlowAIChatAction {
  setInputMessage: (message: string) => void;

  sendMessage: () => Promise<void>;
  fetchMessages: () => Promise<void>;

  internal_createMessage: (params: CreateMessageParams, context: { tempMessageId?: string }) => Promise<string | undefined>;
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
      activeNodeId, activeSessionId, activeTopicId, inputMessage, getNodeMeta,
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
      topicId: activeTopicId,
    }

    const tempMessageId = await internal_createMessage(newMessage, {});

    if (!tempMessageId) {
      console.warn('Failed to create message, abort sending.');
      set({ ...get(), isCreateingMessage: false });
      return;
    }

    // TODO: Get the graph messages from previous node
    const graphMessages: ChatMessage[] = []
    
    // Get the messages from current node
    const currentMessages = getNodeMeta(activeNodeId)?.messages || [];

    const allMessages = [...graphMessages, ...currentMessages];

    await internal_coreProcessMessage(
      allMessages, tempMessageId, {}
    );

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
    const { 
      activeNodeId, 
      activeSessionId, 
      activeTopicId,
      setNodeMeta,
     } = get();
    // Set to node meta
    if (!activeNodeId) {
      console.warn('No active node, abort creating message.');
      return;
    }

    const nodeMeta = get().getNodeMeta(activeNodeId);

    const newMsgId = context?.tempMessageId || `temp-${nanoid()}`;

    setNodeMeta(activeNodeId, { 
      ...nodeMeta,
      messages: [...nodeMeta.messages, {
        content: params.content,
        role: params.role,
        id: newMsgId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        meta: {}, 
        topicId: activeTopicId,
      } as ChatMessage], // Add a placeholder message],
    })
    
    return newMsgId;
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