import { copyToClipboard } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { StateCreator } from 'zustand/vanilla';

import { messageService } from '@/services/message';
import { MessageDispatch, messagesReducer } from '@/store/chat/slices/message/reducer';
import { preventLeavingFn, toggleBooleanList } from '@/store/chat/utils';
import { FlowStore } from '@/store/flow/store';
import { ChatErrorType, GroundingSearch } from '@/types/index';
import {
  ChatImageItem,
  ChatMessage,
  CreateMessageParams,
  MessageMetadata,
  MessageToolCall,
  ModelReasoning,
} from '@/types/message';
import { Action } from '@/utils/storeDebug';
import { nanoid } from '@/utils/uuid';

import { FlowStoreState } from '../../initialState';
import { canvasSelectors } from '../canvas/selector';

export interface FlowMessageAction {
  copyMessage: (id: string, content: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;

  /**
   * Build graph context
   */
  internal_buildGraphContext: () => ChatMessage[];
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
    context?: { sessionId: string; topicId?: string | null },
  ) => void;

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
      imageList?: ChatImageItem[];
      metadata?: MessageMetadata;
      model?: string;
      provider?: string;
      reasoning?: ModelReasoning;
      search?: GroundingSearch;
      toolCalls?: MessageToolCall[];
    },
  ) => Promise<void>;
}

export const flowMessage: StateCreator<
  FlowStore,
  [['zustand/devtools', never]],
  [],
  FlowMessageAction
> = (set, get) => ({
  copyMessage: async (id, content) => {
    await copyToClipboard(content);
  },
  deleteMessage: async (id) => {
    const msgIds = canvasSelectors.getActiveNodeMessageIds(get());
    if (!msgIds.includes(id)) {
      console.warn('Message id not in the active node, abort deleting.', id);
      return;
    }
    let ids = [id];
    await messageService.removeMessages(ids);
    // Remove local
    get().internal_dispatchMessage({ ids, type: 'deleteMessages' });
    await get().refreshMessages();
  },

  internal_buildGraphContext() {
    const { activeNodeId, edges, getNodeMeta } = get();
    if (!activeNodeId) {
      return [];
    }

    // Build adjacency map for reverse traversal (find parent nodes)
    const parentMap: Map<string, string[]> = edges.reduce((map, edge) => {
      if (!map.has(edge.target)) map.set(edge.target, []);
      map.get(edge.target)!.push(edge.source);
      return map;
    }, new Map<string, string[]>());

    // BFS to calculate distance from activeNodeId to all ancestor nodes
    const distances = new Map<string, number>();
    const queue: Array<{ distance: number; nodeId: string }> = [
      { distance: 0, nodeId: activeNodeId },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { nodeId, distance } = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      distances.set(nodeId, distance);

      // Add parent nodes to queue with incremented distance
      const parents = parentMap.get(nodeId) || [];
      for (const parentId of parents) {
        if (!visited.has(parentId)) {
          queue.push({ distance: distance + 1, nodeId: parentId });
        }
      }
    }

    // Collect all messages with their node distances
    let messagesWithDistance: Array<{
      createdAt: number;
      distance: number;
      message: ChatMessage;
    }> = [];

    // Simple context building

    for (const [nodeId, distance] of distances.entries()) {
      const nodeMeta = getNodeMeta(nodeId);
      if (!nodeMeta) continue;
      // If use summary
      if (nodeMeta.useSummary && nodeMeta.summary) {
        messagesWithDistance.push({
          createdAt: nodeMeta.messages[-1].updatedAt || 0,
          distance,
          message: {
            content: `<summary><title>${nodeMeta.title}</title>${nodeMeta.summary}</summary>`,
            createdAt: Date.now(),
            id: `summary_${nodeId}`,
            meta: {},
            role: 'user',
            updatedAt: Date.now(),
          },
        });
        continue;
      }

      // TODO: should warp the messages with xml tags?
      if (nodeMeta?.messages && nodeMeta.messages.length > 0) {
        // TODO: Add before `for` loop would cause loop skip ???

        // messagesWithDistance.push({
        //   createdAt: Date.now(),
        //   distance,
        //   message: {
        //     content: `Node titled "${nodeMeta.title}" start:`,
        //     createdAt: Date.now(),
        //     id: `node_title_${nodeId}`,
        //     meta: {},
        //     role: 'user',
        //     updatedAt: Date.now(),
        //   },
        // });
        for (const message of nodeMeta.messages) {
          // console.log('Add Graph context message:', message);
          messagesWithDistance.push({
            createdAt: message.createdAt || 0,
            distance,
            message,
          });
        }
        // messagesWithDistance.push({
        //   createdAt: Date.now(),
        //   distance,
        //   message: {
        //     content: `Node titled "${nodeMeta.title}" end.`,
        //     createdAt: Date.now(),
        //     id: `node_title_end_${nodeId}`,
        //     meta: {},
        //     role: 'user',
        //     updatedAt: Date.now(),
        //   },
        // });
      }
    }

    // Sort by distance as BFS (farther first), then by creation time
    const retMsgs = messagesWithDistance
      .sort((a, b) => {
        // Primary sort: by distance (descending - farther nodes first)
        if (a.distance !== b.distance) {
          return b.distance - a.distance;
        }
        // Secondary sort: by creation time (ascending - older first)
        return a.createdAt - b.createdAt;
      })
      .map((item) => item.message);

    // TODO(Improvement): Better graph description
    // Necessary: A graph description can let model know what user sees
    // Unnecessarily: The graph description can be poorly generated or understood

    const graphDesc = edges
      .reduce((desc, edge) => {
        const sourceNode = getNodeMeta(edge.source);
        const targetNode = getNodeMeta(edge.target);
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
        id: `graph_description_${activeNodeId}`,
        meta: {},
        role: 'user',
        updatedAt: Date.now(),
      });

    // console.log('Built graph context messages:', retMsgs);

    return retMsgs;
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
      const newMsgId = await messageService.createMessage(params);
      if (!context?.skipRefresh) {
        internal_toggleMessageLoading(true, tempId);
        await refreshMessages();
      }
      setNodeMeta(activeNodeId, {
        ...nodeMeta,
        // Add a placeholder message],
        messageIds: [...nodeMeta.messageIds, newMsgId],
        messages: [
          ...nodeMeta.messages,
          {
            content: params.content,
            createdAt: Date.now(),
            id: newMsgId,
            meta: {},
            role: params.role,
            topicId: activeTopicId,
            updatedAt: Date.now(),
          } as ChatMessage,
        ],
      });
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
  internal_dispatchMessage(payload) {
    // const activeSessionId = typeof context !== 'undefined' ? context.sessionId : get().activeSessionId;
    // const topicId = typeof context !== 'undefined' ? context.topicId : get().activeTopicId;

    if (!get().activeNodeId) return;

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
      imageList: extra?.imageList,
      metadata: extra?.metadata,
      model: extra?.model,
      provider: extra?.provider,
      reasoning: extra?.reasoning,
      search: extra?.search,
    });
    await refreshMessages();
  },
});
