import {
  ChatErrorType,
  ChatMessage,
  CreateMessageParams,
  MessageMetadata,
  ModelReasoning,
} from '@lobechat/types';
import { copyToClipboard } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { mutate } from 'swr';
import { StateCreator } from 'zustand/vanilla';

import { messageService } from '@/services/message';
import { MessageDispatch, messagesReducer } from '@/store/chat/slices/message/reducer';
import { preventLeavingFn, toggleBooleanList } from '@/store/chat/utils';
import { messageSelectors } from '@/store/graph/selectors';
import { GraphStore } from '@/store/graph/store';
import { nanoid } from '@/utils/index';
import { Action } from '@/utils/storeDebug';

import { messageMapKey, nodeMapKey, searchChildNodesWithBFS } from '../../utils';
import { SWR_USE_FETCH_GRAPH_CANVAS } from '../canvas/action';

export interface GraphMessageAction {
  copyMessage: (id: string, content: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;

  /**
   * Build graph context
   */
  internal_buildGraphContext: (nodeId: string) => ChatMessage[];

  internal_createMessage: (
    params: CreateMessageParams,
    context?: { skipRefresh?: boolean; tempMessageId?: string },
  ) => Promise<string | undefined>;
  /**
   * create a temp message for optimistic update
   * otherwise the message will be too slow to show
   */
  internal_createTmpMessage: (params: CreateMessageParams) => string;
  /**
   * update message at the frontend
   * this method will not update messages to database
   */
  internal_dispatchMessage: (
    payload: MessageDispatch,
    context?: { nodeId?: string | null; sessionId: string },
  ) => void;

  /**
   * helper to toggle the loading state of the array,used by these three toggleXXXLoading
   */
  internal_toggleLoadingArrays: (
    key: keyof GraphStore,
    loading: boolean,
    id?: string,
    action?: Action,
  ) => AbortController | undefined;
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
      metadata?: MessageMetadata;
      model?: string;
      provider?: string;
      reasoning?: ModelReasoning;
    },
  ) => Promise<void>;

  refreshMessages: () => Promise<void>;

  toggleMessageEditing: (id: string, editing: boolean) => void;
}

export const graphMessage: StateCreator<
  GraphStore,
  [['zustand/devtools', never]],
  [],
  GraphMessageAction
> = (set, get) => ({
  copyMessage: async (id, content) => {
    await copyToClipboard(content);
  },
  deleteMessage: async (id) => {
    const msgIds = messageSelectors.getActiveNodeMessageIds(get());
    if (!msgIds || !msgIds.includes(id)) {
      console.warn('Message id not in the active node, abort deleting.', id);
      return;
    }
    let ids = [id];
    await messageService.removeMessages(ids);
    // Remove local
    get().internal_dispatchMessage({ ids, type: 'deleteMessages' });
    await get().refreshMessages();
  },
  internal_buildGraphContext(nodeId) {
    const { stateMap, activeStateId, messagesMap, nodeMetaMap } = get();

    if (!activeStateId) return [];
    const state = stateMap[activeStateId];

    console.log('Building graph context for node:', nodeId, state);

    if (!state) return [];

    const { children, edges } = searchChildNodesWithBFS(
      state.edges,
      nodeMetaMap,
      activeStateId,
      nodeId,
    );

    console.log('Found context children:', children);

    const retMsgs = children
      .sort((a, b) => b.distance - a.distance)
      .flatMap((child) => {
        if (child.meta?.useSummary) {
          return [
            {
              content: `<summary><title>${child.meta?.title}</title>${child.meta.summary}</summary>`,
              createdAt: Date.now(),
              id: `summary_${nodeId}`,
              meta: {},
              role: 'user',
              updatedAt: Date.now(),
            } as ChatMessage,
          ];
        }
        const message = messagesMap[messageMapKey(activeStateId, child.id)];
        if (!message) return [];
        return message;
      })
      .filter(Boolean);

    // TODO(Improvement): Better graph description
    // Necessary: A graph description can let model know what user sees
    // Unnecessarily: The graph description can be poorly generated or understood

    const graphDesc = edges
      .reduce((desc, edge) => {
        const sourceNode = nodeMetaMap[nodeMapKey(activeStateId, edge.source)];
        const targetNode = nodeMetaMap[nodeMapKey(activeStateId, edge.target)];
        const sourceName = sourceNode?.title || edge.source;
        const targetName = targetNode?.title || edge.target;
        if (sourceNode && targetNode) {
          desc.push(`(${sourceName} -> ${targetName})`);
        }
        return desc;
      }, [] as string[])
      .join(', ');

    // Add graph description at the end of the context
    // Only add when there are more than SOME edges
    if (edges.length > 3)
      retMsgs.push({
        content: `The above conversation messages are from a knowledge graph. And the edges are ${graphDesc}`,
        createdAt: Date.now(),
        id: `graph_description_${nodeId}`,
        meta: {},
        role: 'user',
        updatedAt: Date.now(),
      });

    return retMsgs;
  },

  internal_createMessage: async (params, context) => {
    const {
      refreshMessages,
      internal_toggleMessageLoading,
      internal_dispatchMessage,
      internal_createTmpMessage,
    } = get();
    // Set to node meta
    if (!params?.graphNodeId) {
      console.warn('No node id, abort creating message.');
      return;
    }

    let tempId = context?.tempMessageId;
    if (!tempId) {
      tempId = internal_createTmpMessage(params);
      internal_toggleMessageLoading(true, tempId);
    }

    try {
      const newMsgId = await messageService.createMessage(params);
      if (!context?.skipRefresh) {
        internal_toggleMessageLoading(true, tempId);
        await refreshMessages();
      }
      internal_toggleMessageLoading(false, tempId);
      return newMsgId;
    } catch (e) {
      internal_toggleMessageLoading(false, tempId);
      internal_dispatchMessage({
        id: tempId,
        type: 'updateMessage',
        value: {
          error: {
            body: e,
            message: (e as Error).message || 'Failed to create message',
            type: ChatErrorType.CreateMessageError,
          },
        },
      });
    }
  },
  internal_createTmpMessage: (message) => {
    const { internal_dispatchMessage } = get();

    // use optimistic update to avoid the slow waiting
    const tempId = 'tmp_' + nanoid();
    internal_dispatchMessage({ id: tempId, type: 'createMessage', value: message });

    return tempId;
  },
  internal_dispatchMessage(payload, context) {
    // const activeSessionId = typeof context !== 'undefined' ? context.sessionId : get().activeSessionId;
    // const topicId = typeof context !== 'undefined' ? context.topicId : get().activeTopicId;

    const nodeId =
      typeof context !== 'undefined' && context.nodeId ? context.nodeId : get().activeNodeId;

    const { activeStateId } = get();

    if (!activeStateId || !nodeId) return;

    // Getn node meta
    const oldMessages = messageSelectors.getNodeMessages(get())(nodeId) || [];

    const messages = messagesReducer(oldMessages, payload);

    const nextMap = {
      ...get().messagesMap,
      [messageMapKey(activeStateId, nodeId)]: messages,
    };

    if (isEqual(nextMap, get().messagesMap)) return;

    set({ messagesMap: nextMap });
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
      metadata: extra?.metadata,
      model: extra?.model,
      provider: extra?.provider,
      reasoning: extra?.reasoning,
    });
    await refreshMessages();
  },
  refreshMessages: async () => {
    await mutate([SWR_USE_FETCH_GRAPH_CANVAS, get().activeStateId]);
  },

  toggleMessageEditing: (id, editing) => {
    set(
      { messageEditingIds: toggleBooleanList(get().messageEditingIds, id, editing) },
      false,
      'toggleMessageEditing',
    );
  },
});
