import { StateCreator } from 'zustand/vanilla';
import { GraphStore, messageSelectors } from '@/store/graph';

import { messageMapKey } from '../../utils';

import { chainSummaryHistory } from '@lobechat/prompts';

import { LOADING_FLAT, MESSAGE_CANCEL_FLAT } from '@/const/index';
import { chatService } from '@/services/chat';
import { messageService } from '@/services/message';
import { getAgentStoreState } from '@/store/agent';
import { agentChatConfigSelectors, agentSelectors } from '@/store/agent/selectors';
import { ChatMessage, CreateMessageParams, SendMessageParams } from '@/types/message';
import { Action, setNamespace } from '@/utils/storeDebug';

import { canvasSelectors } from '../canvas/selector';

const n = setNamespace('f');

export interface GraphChatAction {
    /**
 * Deletes an existing message and generates a new one in its place
 */
    delAndRegenerateMessage: (id: string) => Promise<void>;

    generateHistorySummary: (nodeId?: string) => Promise<void>;
    internal_coreProcessMessage: (
        messages: ChatMessage[],
        messageId: string,
        options?: any,
    ) => Promise<void>;

    internal_fetchAIResponse: (input: {
        messageId: string;
        messages: ChatMessage[];
        model: string;
        provider: string;
    }) => Promise<{
        content: string;
        isFunctionCall: boolean;
        traceId?: string;
    }>;

    /**
     * Internal Methods
     */
    /**
     * Resends a specific message, optionally using a trace ID for tracking
     */
    internal_resendMessage: (
        id: string,
        params?: {
            inPortalThread?: boolean;
            messages?: ChatMessage[];
            threadId?: string;
            traceId?: string;
        },
    ) => Promise<void>;

    /**
     * Toggles the loading state for AI message generation, managing the UI feedback
     */
    internal_toggleChatLoading: (
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

    /**
     * Regenerates a specific message in the chat
     */
    regenerateMessage: (id: string) => Promise<void>;
    sendMessage: (nodeId: string, params: SendMessageParams) => Promise<void>;

    setInputMessage: (message: string) => void;

    /**
     * Interrupts the ongoing ai message generation process
     */
    stopGenerateMessage: () => void;
}

export const graphChat: StateCreator<
    GraphStore,
    [['zustand/devtools', never]],
    [],
    GraphChatAction
> = (set, get) => ({
    delAndRegenerateMessage: async (id) => {
        get().internal_resendMessage(id);
        get().deleteMessage(id);
    },
    generateHistorySummary: async (nodeId) => {
        const { 
            activeNodeId, 
            messagesMap, 
            isGeneratingSummary, 
            activeStateId,
            updateNodeMeta,
            internal_updateNodeMeta,
         } = get();

        let targetNodeId = nodeId ?? activeNodeId;

        if (!targetNodeId || !activeStateId) {
            console.warn('No active node, abort generating history summary.');
            return;
        }

        const messages = messagesMap[messageMapKey(activeStateId, targetNodeId)];
        if (!messages || messages.length === 0) {
            console.warn('No messages in the node, abort generating history summary.');
            return;
        }

        if (isGeneratingSummary) {
            console.warn('Already generating summary, please wait.');
            return;
        }
        set({ isGeneratingSummary: true });

        // Generate summary using chatService
        const agentStoreState = getAgentStoreState();
        const { model, provider } = agentSelectors.currentAgentConfig(agentStoreState);

        try {
            let historySummary = '';
            await chatService.fetchPresetTaskResult({
                onFinish: async (text) => {
                    historySummary = text;
                },
                params: {
                    ...chainSummaryHistory(messages),
                    model,
                    provider,
                    stream: false,
                },
            });
            internal_updateNodeMeta(targetNodeId, {
                summary: historySummary,
                isLatestSummary: true,
            });
            await updateNodeMeta(targetNodeId, {
                summary: historySummary,
                isLatestSummary: true,
            });
            console.log('Generated history summary:', historySummary);
        } catch (e) {
            console.error('Failed to generate history summary:', e);
        }

        set({ isGeneratingSummary: false });
    },
    internal_coreProcessMessage: async (messages: ChatMessage[], userMessageId: string) => {
        const { 
            activeSessionId, 
            activeNodeId, 
            internal_createMessage, 
            internal_fetchAIResponse 
        } = get();

        const agentStoreState = getAgentStoreState();
        const { model, provider } = agentSelectors.currentAgentConfig(agentStoreState);

        const assistantMessage: CreateMessageParams = {
            content: LOADING_FLAT,
            fromModel: model,
            fromProvider: provider,
            parentId: userMessageId,

            role: 'assistant',
            sessionId: activeSessionId,
            graphNodeId: activeNodeId,
        };

        const assistantId = await internal_createMessage(assistantMessage);

        if (!assistantId) return;

        // 4. fetch the AI response
        await internal_fetchAIResponse({
            messageId: assistantId,
            messages,
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

        const abortController = internal_toggleChatLoading(
            true,
            messageId,
            n('generateMessage(start)', { messageId, messages }),
        );

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
            abortController,
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

            onFinish: async (content, { reasoning, usage, speed }) => {
                // update the content after fetch result
                await internal_updateMessageContent(messageId, content, {
                    metadata: speed ? { ...usage, ...speed } : usage,
                    reasoning: !!reasoning ? { ...reasoning, duration } : undefined,
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
            params: {
                messages,
                model,
                provider,
                ...agentConfig.params,
                plugins: agentConfig.plugins,
            },
        });

        internal_toggleChatLoading(false, messageId, n('generateMessage(end)') as string);

        return { content: output, isFunctionCall, traceId: msgTraceId };
    },
    internal_resendMessage: async (messageId, { messages: outChats } = {}) => {
        // 1. 构造所有相关的历史记录
        const chats = outChats ?? messageSelectors.getActiveNodeMessages(get()) ?? [];

        const currentIndex = chats.findIndex((c) => c.id === messageId);
        if (currentIndex < 0) return;

        const currentMessage = chats[currentIndex];

        let contextMessages: ChatMessage[] = [];

        switch (currentMessage.role) {
            case 'user': {
                contextMessages = chats.slice(0, currentIndex + 1);
                break;
            }
            case 'assistant': {
                // 消息是 AI 发出的因此需要找到它的 user 消息
                const userId = currentMessage.parentId;
                const userIndex = chats.findIndex((c) => c.id === userId);
                // 如果消息没有 parentId，那么同 user/function 模式
                contextMessages = chats.slice(0, userIndex < 0 ? currentIndex + 1 : userIndex + 1);
                break;
            }
        }

        if (contextMessages.length <= 0) return;

        const { internal_coreProcessMessage } = get();

        const latestMsg = contextMessages.findLast((s) => s.role === 'user');

        if (!latestMsg) return;

        await internal_coreProcessMessage(contextMessages, latestMsg.id);
    },
    internal_toggleChatLoading: (loading, id, action) => {
        return get().internal_toggleLoadingArrays('chatLoadingIds', loading, id, action);
    },
    internal_toggleChatReasoning: (loading, id, action) => {
        return get().internal_toggleLoadingArrays('reasoningLoadingIds', loading, id, action);
    },
    regenerateMessage: async (id) => {
        await get().internal_resendMessage(id);
    },

    sendMessage: async (nodeId, { message }) => {
        const {
            activeSessionId,
            activeStateId,
            internal_coreProcessMessage,
            internal_createMessage,
            // setNodeMeta,
            internal_updateNodeMeta,
            updateNodeMeta,

            // internal_toggleMessageLoading,
            // internal_createTmpMessage,
        } = get();

        // if message is empty, then stop
        if (!message || !activeStateId) return;

        // Set loading
        set({ isCreatingMessage: true });

        // Get node meta
        const nodeMeta = canvasSelectors.getNodeMeta(get())(activeStateId, nodeId);
        if (!nodeMeta) {
            console.warn('Node meta not found, abort sending.');
            set({ isCreatingMessage: false });
            return;
        }

        const messages = messageSelectors.getNodeMessages(get())(nodeId);

        if (!messages) {
            console.warn('Messages not found for node, abort sending.');
            set({ isCreatingMessage: false });
            return;
        }

        let newMessage: CreateMessageParams = {
            content: message,
            role: 'user',
            sessionId: activeSessionId,
            graphNodeId: nodeId,
        };

        let tempMessageId: string | undefined = undefined;

        const id = await internal_createMessage(newMessage, {
            tempMessageId,
        });

        if (!id) {
            set({ isCreatingMessage: false });
            // Failed to create message
            console.warn('Failed to create assistant message');
            return;
        }

        // TODO: Get the graph messages from previous node
        const graphMessages: ChatMessage[] = get().internal_buildGraphContext(nodeId);

        // console.log('Graph messages:', graphMessages);

        // Get the messages from current node
        const currentMessages = messageSelectors.getNodeMessages(get())(nodeId);

        if (!currentMessages) {
            console.error('Messages not found for node, abort sending.');
            set({ isCreatingMessage: false });
            return;
        }

        const allMessages = [...graphMessages, ...currentMessages];

        // Reset summary status
        internal_updateNodeMeta(nodeId, {
            isLatestSummary: false,
        })

        await internal_coreProcessMessage(allMessages, id, {});

        await updateNodeMeta(nodeId, {
            isLatestSummary: false,
        })

        set({ isCreatingMessage: false });
    },
    setInputMessage: (message) => {
        set({
            ...get(),
            inputMessage: message,
        });
    },
    stopGenerateMessage: () => {
        const { chatLoadingIdsAbortController, internal_toggleChatLoading } = get();

        if (!chatLoadingIdsAbortController) return;

        chatLoadingIdsAbortController.abort(MESSAGE_CANCEL_FLAT);

        internal_toggleChatLoading(false, undefined, n('stopGenerateMessage') as string);
    },
});

