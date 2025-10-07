import { StateCreator } from "zustand/vanilla";
import { ChatImageItem, ChatMessage, CreateMessageParams, MessageMetadata, MessageToolCall, ModelReasoning, SendMessageParams } from '@/types/message';
import isEqual from 'fast-deep-equal';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { FlowStore } from '@/store/flow/store';
import { useChatStore } from '@/store/chat/store';
import { useSessionStore } from "@/store/session";
import { messageService } from "@/services/message";
import { LOADING_FLAT } from "@/const/index";
import { getAgentStoreState } from "@/store/agent";
import { agentChatConfigSelectors, agentSelectors } from "@/store/agent/selectors";
import { nanoid } from "node_modules/@lobechat/model-runtime/src/utils/uuid";
import { chatService } from "@/services/chat";
import { mutate, SWRResponse } from "swr";
import { MessageDispatch, messagesReducer } from "@/store/chat/slices/message/reducer";
import { GroundingSearch } from "@/types/index";
import { preventLeavingFn, toggleBooleanList } from "@/store/chat/utils";
import { ChatStoreState } from "@/store/chat";
import { Action, setNamespace } from "@/utils/storeDebug";
import { chatSelectors } from "@/store/chat/selectors";
import { FlowStoreState } from "../../initialState";
import { useClientDataSWR } from "@/libs/swr";

const n = setNamespace('f');

const SWR_USE_FETCH_MESSAGES = 'SWR_USE_FETCH_MESSAGES';

export interface FlowAIChatAction {
  setInputMessage: (message: string) => void;

  sendMessage: (params: SendMessageParams) => Promise<void>;
  
    // query
  useFetchMessages: (
    enable: boolean,
    sessionId: string,
    topicId?: string,
  ) => SWRResponse<ChatMessage[]>;

  refreshMessages: () => Promise<void>;

  internal_createMessage: (params: CreateMessageParams, context: { tempMessageId?: string }) => Promise<string | undefined>;
  internal_fetchAIResponse: (input: {
    messages: ChatMessage[];
    messageId: string;
    model: string;
    provider: string;
  }) => Promise<{
    isFunctionCall: boolean;
    content: string;
    traceId?: string;
  }>;
  internal_coreProcessMessage: (messages: ChatMessage[], messageId: string, options: any) => Promise<void>;

  /**
 * update message at the frontend
 * this method will not update messages to database
 */
  internal_dispatchMessage: (
    payload: MessageDispatch,
    context?: { topicId?: string | null; sessionId: string },
  ) => void;

  /**
 * method to toggle message create loading state
 * the AI message status is creating -> generating
 * other message role like user and tool , only this method need to be called
 */
  internal_toggleMessageLoading: (loading: boolean, id: string) => void;

  /**
 * Toggles the loading state for AI message generation, managing the UI feedback
 */
  internal_toggleChatLoading: (
    loading: boolean,
    id?: string,
    action?: Action,
  ) => AbortController | undefined;

  /**
 * update the message content with optimistic update
 * a method used by other action
 */
  internal_updateMessageContent: (
    id: string,
    content: string,
    extra?: {
      toolCalls?: MessageToolCall[];
      reasoning?: ModelReasoning;
      search?: GroundingSearch;
      metadata?: MessageMetadata;
      imageList?: ChatImageItem[];
      model?: string;
      provider?: string;
    },
  ) => Promise<void>;

  /**
 * helper to toggle the loading state of the array,used by these three toggleXXXLoading
 */
  internal_toggleLoadingArrays: (
    key: keyof FlowStoreState,
    loading: boolean,
    id?: string,
    action?: Action,
  ) => AbortController | undefined;

  /**
 * Toggles the loading state for AI message reasoning, managing the UI feedback
 */
  internal_toggleChatReasoning: (
    loading: boolean,
    id?: string,
    action?: string,
  ) => AbortController | undefined;
}


export const flowAIChat: StateCreator<
  FlowStore,
  [['zustand/devtools', never]],
  [],
  FlowAIChatAction
> = (set, get) => ({
  sendMessage: async ({ message }) => {
    const {
      activeNodeId, activeSessionId, activeTopicId, getNodeMeta,
      internal_coreProcessMessage, internal_createMessage,
    } = get()

    // if message is empty, then stop
    if (!message) return;

    if (!activeNodeId) {
      console.warn('No active node, abort sending.');
      return
    }

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
      content: message,
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
  useFetchMessages: (enable, sessionId, activeTopicId) =>
    useClientDataSWR<ChatMessage[]>(
      enable ? [SWR_USE_FETCH_MESSAGES, sessionId, activeTopicId] : null,
      async ([, sessionId, topicId]: [string, string, string | undefined]) =>
        messageService.getMessages(sessionId, topicId),
      {
        onSuccess: (messages, key) => {
          // TODO: Set messages to the target node

        },
      },
    ),
  setInputMessage: (message) => {
    set({
      ...get(),
      inputMessage: message,
    });
  },
  internal_createMessage: async (params, context) => {
    const {
      activeNodeId,
      activeTopicId,
      setNodeMeta,
    } = get();
    // Set to node meta
    if (!activeNodeId) {
      console.warn('No active node, abort creating message.');
      return;
    }

    const nodeMeta = get().getNodeMeta(activeNodeId);

    const newMsgId = params?.id || context?.tempMessageId || `temp-${nanoid()}`;

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
  internal_coreProcessMessage: async (messages: ChatMessage[], userMessageId: string) => {
    const {
      activeSessionId,
      activeTopicId,
      internal_createMessage,
      internal_fetchAIResponse,
    } = get();

    const agentStoreState = getAgentStoreState();
    const { model, provider } = agentSelectors.currentAgentConfig(agentStoreState);

    const assistantMessage: CreateMessageParams = {
      role: 'assistant',
      content: LOADING_FLAT,
      fromModel: model,
      fromProvider: provider,

      parentId: userMessageId,
      sessionId: activeSessionId,
      topicId: activeTopicId, // if there is activeTopicId，then add it to topicId
    };

    const assistantId = await internal_createMessage(assistantMessage, {});

    if (!assistantId) return;

    // 4. fetch the AI response
    const { isFunctionCall, content } = await internal_fetchAIResponse({
      messages,
      messageId: assistantId,
      model,
      provider: provider!,
    });

    // TODO: auto summary? or triggle by user
  },
  internal_fetchAIResponse: async ({ messages, messageId, provider, model }) => {
    const {
      internal_dispatchMessage,
      internal_updateMessageContent,
      internal_toggleChatReasoning,
      internal_toggleChatLoading,
      refreshMessages,
    } = get();

    const agentConfig = agentSelectors.currentAgentConfig(getAgentStoreState());
    const chatConfig = agentChatConfigSelectors.currentChatConfig(getAgentStoreState());

    // ================================== //
    //   messages uniformly preprocess    //
    // ================================== //
    // 4. handle max_tokens
    agentConfig.params.max_tokens = chatConfig.enableMaxTokens
      ? agentConfig.params.max_tokens
      : undefined;

    // 5. handle reasoning_effort
    agentConfig.params.reasoning_effort = chatConfig.enableReasoningEffort
      ? agentConfig.params.reasoning_effort
      : undefined;

    let isFunctionCall = false;
    let msgTraceId: string | undefined;
    let output = '';
    let thinking = '';
    let thinkingStartAt: number;
    let duration: number;
    // to upload image
    // const uploadTasks: Map<string, Promise<{ id?: string; url?: string }>> = new Map();

    // const historySummary = chatConfig.enableCompressHistory
    //   ? topicSelectors.currentActiveTopicSummary(get())
    //   : undefined;
    await chatService.createAssistantMessageStream({
      // abortController,
      params: {
        messages,
        model,
        provider,
        ...agentConfig.params,
        plugins: agentConfig.plugins,
      },
      // historySummary: historySummary?.content,
      // trace: {
      //   traceId: params?.traceId,
      //   sessionId: get().activeId,
      //   topicId: get().activeTopicId,
      //   traceName: TraceNameMap.Conversation,
      // },
      // isWelcomeQuestion: params?.isWelcomeQuestion,
      onErrorHandle: async (error) => {
        await messageService.updateMessageError(messageId, error);
        await refreshMessages();
      },
      onFinish: async (
        content,
        { reasoning, usage, speed },
      ) => {
        // update the content after fetch result
        await internal_updateMessageContent(messageId, content, {
          reasoning: !!reasoning ? { ...reasoning, duration } : undefined,
          metadata: speed ? { ...usage, ...speed } : usage,
        });
      },
      onMessageHandle: async (chunk) => {
        switch (chunk.type) {
          case 'grounding': {
            // if there is no citations, then stop
            if (
              !chunk.grounding ||
              !chunk.grounding.citations ||
              chunk.grounding.citations.length <= 0
            )
              return;

            internal_dispatchMessage({
              id: messageId,
              type: 'updateMessage',
              value: {
                search: {
                  citations: chunk.grounding.citations,
                  searchQueries: chunk.grounding.searchQueries,
                },
              },
            });
            break;
          }

          case 'text': {
            output += chunk.text;

            // if there is no duration, it means the end of reasoning
            if (!duration) {
              duration = Date.now() - thinkingStartAt;

              const isInChatReasoning = get().reasoningLoadingIds.includes(messageId);
              if (isInChatReasoning) {
                internal_toggleChatReasoning(
                  false,
                  messageId,
                  n('toggleChatReasoning/false') as string,
                );
              }
            }

            internal_dispatchMessage({
              id: messageId,
              type: 'updateMessage',
              value: {
                content: output,
                reasoning: !!thinking ? { content: thinking, duration } : undefined,
              },
            });
            break;
          }

          case 'reasoning': {
            // if there is no thinkingStartAt, it means the start of reasoning
            if (!thinkingStartAt) {
              thinkingStartAt = Date.now();
              internal_toggleChatReasoning(
                true,
                messageId,
                n('toggleChatReasoning/true') as string,
              );
            }

            thinking += chunk.text;

            internal_dispatchMessage({
              id: messageId,
              type: 'updateMessage',
              value: { reasoning: { content: thinking } },
            });
            break;
          }

        }
      },
    });

    internal_toggleChatLoading(false, messageId, n('generateMessage(end)') as string);

    return { isFunctionCall, traceId: msgTraceId, content: output };
  },
  refreshMessages: async () => {
    const { activeSessionId, activeTopicId } = get()
    await mutate([SWR_USE_FETCH_MESSAGES, activeSessionId, activeTopicId]);
  },
  internal_dispatchMessage(payload, context) {
    const activeSessionId = typeof context !== 'undefined' ? context.sessionId : get().activeSessionId;
    const topicId = typeof context !== 'undefined' ? context.topicId : get().activeTopicId;

    if (!get().activeNodeId) return

    // Getn node meta
    const nodeMeta = get().getNodeMeta(get().activeNodeId!);
    if (!nodeMeta) return;


    const messages = messagesReducer(nodeMeta.messages, payload);

    if (isEqual(messages, nodeMeta.messages)) return;

    get().setNodeMeta(get().activeNodeId!, {
      messages,
    })

  },
  internal_toggleLoadingArrays: (key, loading, id, action) => {
    const abortControllerKey = `${key}AbortController`;
    if (loading) {
      window.addEventListener('beforeunload', preventLeavingFn);

      const abortController = new AbortController();
      set(
        {
          [abortControllerKey]: abortController,
          [key]: toggleBooleanList(get()[key] as string[], id!, loading),
        },
        false,
        action,
      );

      return abortController;
    } else {
      if (!id) {
        set({ [abortControllerKey]: undefined, [key]: [] }, false, action);
      } else
        set(
          {
            [abortControllerKey]: undefined,
            [key]: toggleBooleanList(get()[key] as string[], id, loading),
          },
          false,
          action,
        );

      window.removeEventListener('beforeunload', preventLeavingFn);
    }
  },
  internal_toggleChatLoading: (loading, id, action) => {
    return get().internal_toggleLoadingArrays('chatLoadingIds', loading, id, action);
  },
  internal_toggleMessageLoading: (loading, id) => {
    set(
      {
        messageLoadingIds: toggleBooleanList(get().messageLoadingIds, id, loading),
      },
      false,
      `internal_toggleMessageLoading/${loading ? 'start' : 'end'}`,
    );
  },
  internal_toggleChatReasoning: (loading, id, action) => {
    return get().internal_toggleLoadingArrays('reasoningLoadingIds', loading, id, action);
  },

  internal_updateMessageContent: async (id, content, extra) => {
    const { internal_dispatchMessage, refreshMessages } = get();

    internal_dispatchMessage({
      id,
      type: 'updateMessage',
      value: { content },
    });

    await messageService.updateMessage(id, {
      content,
      reasoning: extra?.reasoning,
      search: extra?.search,
      metadata: extra?.metadata,
      model: extra?.model,
      provider: extra?.provider,
      imageList: extra?.imageList,
    });
    await refreshMessages();
  },
})