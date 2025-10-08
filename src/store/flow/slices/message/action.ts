import { StateCreator } from 'zustand/vanilla';
import { ChatImageItem, ChatMessage, CreateMessageParams, MessageMetadata, MessageToolCall, ModelReasoning, SendMessageParams } from '@/types/message';
import isEqual from 'fast-deep-equal';
import { FlowStore } from '@/store/flow/store';
import { messageService } from "@/services/message";
import { LOADING_FLAT, MESSAGE_CANCEL_FLAT } from "@/const/index";
import { getAgentStoreState } from "@/store/agent";
import { agentChatConfigSelectors, agentSelectors } from "@/store/agent/selectors";
import { nanoid } from "node_modules/@lobechat/model-runtime/src/utils/uuid";
import { chatService } from "@/services/chat";
import { mutate, SWRResponse } from "swr";
import { MessageDispatch, messagesReducer } from "@/store/chat/slices/message/reducer";
import { ChatErrorType, GroundingSearch } from "@/types/index";
import { preventLeavingFn, toggleBooleanList } from "@/store/chat/utils";
import { Action, setNamespace } from "@/utils/storeDebug";
import { FlowStoreState } from "../../initialState";
import { useClientDataSWR } from "@/libs/swr";
import { chainSummaryHistory } from "packages/prompts/src";
import { copyToClipboard } from '@lobehub/ui';
import { flowMessageSelectors } from './selector';
import { canvasSelectors } from '../canvas/selector';
import message from 'antd/es/message';

const SWR_USE_FETCH_MESSAGES = 'SWR_USE_FETCH_MESSAGES';

export interface FlowMessageAction {

    deleteMessage: (id: string) => Promise<void>;
    copyMessage: (id: string, content: string) => Promise<void>;

    // query
    useFetchMessages: (
        enable: boolean,
        sessionId: string,
        topicId?: string,
    ) => SWRResponse<ChatMessage[]>;
    /**
     * create a temp message for optimistic update
     * otherwise the message will be too slow to show
     */
    internal_createTmpMessage: (params: CreateMessageParams) => string;
    internal_createMessage: (params: CreateMessageParams, context?: { tempMessageId?: string, skipRefresh?: boolean }) => Promise<string | undefined>;
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
}

export const flowMessage: StateCreator<
    FlowStore,
    [['zustand/devtools', never]],
    [],
    FlowMessageAction
> = (set, get) => ({
    deleteMessage: async (id) => {
        const msgIds = canvasSelectors.getActiveNodeMessageIds(get())
        if (!msgIds.includes(id)) {
            console.warn('Message id not in the active node, abort deleting.', id);
            return;
        }
        let ids = [id];
        await messageService.removeMessages(ids);
        // Remove local
        get().internal_dispatchMessage({ type: 'deleteMessages', ids });
        await get().refreshMessages();
    },
    copyMessage: async (id, content) => {
        await copyToClipboard(content);
    },
    internal_createMessage: async (params, context) => {
        const {
            activeNodeId,
            activeTopicId,
            setNodeMeta,
            refreshMessages,
            internal_toggleMessageLoading,
            internal_dispatchMessage,
            internal_createTmpMessage,
        } = get();
        // Set to node meta
        if (!activeNodeId) {
            console.warn('No active node, abort creating message.');
            return;
        }

        if (!activeTopicId) {
            console.warn('No active topic, abort creating message.');
            return;
        }

        const nodeMeta = get().getNodeMeta(activeNodeId);

        if (!nodeMeta) {
            console.warn('Node meta not found, abort creating message.');
            return;
        }

        let tempId = context?.tempMessageId;
        if (!tempId) {
            console.log('internal_createMessage: no tempId, create one', params, context);
            tempId = internal_createTmpMessage(params);
            internal_toggleMessageLoading(true, tempId);
        }

        try {
            const newMsgId = await messageService.createMessage(params)
            if (!context?.skipRefresh) {
                internal_toggleMessageLoading(true, tempId);
                await refreshMessages();
            }
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
            internal_toggleMessageLoading(false, tempId);
            return newMsgId;
        } catch (e) {
            internal_toggleMessageLoading(false, tempId);
            internal_dispatchMessage({
                id: tempId,
                type: 'updateMessage',
                value: {
                    error: {
                        type: ChatErrorType.CreateMessageError,
                        message: (e as Error).message || 'Failed to create message',
                        body: e
                    }
                }
            })
        }
    },

    internal_createTmpMessage: (message) => {
        const { internal_dispatchMessage } = get();

        // use optimistic update to avoid the slow waiting
        const tempId = 'tmp_' + nanoid();
        internal_dispatchMessage({ type: 'createMessage', id: tempId, value: message });

        return tempId;
    },
    internal_dispatchMessage(payload, _) {
        // const activeSessionId = typeof context !== 'undefined' ? context.sessionId : get().activeSessionId;
        // const topicId = typeof context !== 'undefined' ? context.topicId : get().activeTopicId;

        if (!get().activeNodeId) return

        // Getn node meta
        const nodeMeta = get().getNodeMeta(get().activeNodeId!);
        if (!nodeMeta) return;

        const messages = messagesReducer(nodeMeta.messages, payload);

        if (isEqual(messages, nodeMeta.messages)) return;

        get().setNodeMeta(get().activeNodeId!, {
            messages,
        });
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

    internal_toggleMessageLoading: (loading, id) => {
        set(
            {
                messageLoadingIds: toggleBooleanList(get().messageLoadingIds, id, loading),
            },
            false,
            `internal_toggleMessageLoading/${loading ? 'start' : 'end'}`,
        );
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
})