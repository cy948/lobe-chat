import type { ExportedTopic, ImportedMessage } from '@lobechat/types';

import { messagePlugins, messages, topics } from '../../schemas';
import type { LobeChatDatabase, Transaction } from '../../type';
import { idGenerator } from '../../utils/idGenerator';

export const TOPIC_IMPORT_MESSAGE_BATCH_SIZE = 500;

export interface ImportTopicParams {
  agentId: string;
  /** JSON string or parsed object */
  data: ExportedTopic | ImportedMessage[] | string;
  groupId?: string | null;
}

export interface ImportTopicResult {
  messageCount: number;
  topicId: string;
}

interface PreparedMessage {
  agentId: string | null;
  content: string;
  createdAt: Date;
  error?: Record<string, any> | null;
  id: string;
  metadata?: Record<string, any> | null;
  model?: string | null;
  parentId: string | null;
  provider?: string | null;
  reasoning?: Record<string, any> | null;
  role: string;
  search?: Record<string, any> | null;
  tools?: Record<string, any>[] | null;
  topicId: string;
  traceId?: string | null;
  updatedAt: Date;
  userId: string;
  workspaceId: string | null;
}

interface PreparedMessagePlugin {
  apiName?: string | null;
  arguments?: string | null;
  error?: Record<string, any> | null;
  id: string;
  identifier?: string | null;
  state?: Record<string, any> | null;
  toolCallId?: string | null;
  type?: string | null;
  userId: string;
  workspaceId: string | null;
}

export interface RestoreMessagesParams {
  agentId?: string | null;
  importedMessages: ImportedMessage[];
  topicId: string;
  transaction: Transaction;
}

export interface RestoreMessagesResult {
  messageCount: number;
  tailMessageId?: string;
}

export class TopicImporterRepo {
  private userId: string;
  private db: LobeChatDatabase;
  private workspaceId?: string;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.userId = userId;
    this.db = db;
    this.workspaceId = workspaceId;
  }

  /**
   * Import messages as a new topic
   */
  importTopic = async (params: ImportTopicParams): Promise<ImportTopicResult> => {
    const { agentId, groupId, data } = params;

    // Parse data if it's a string
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

    // Extract messages and title from parsed data
    const { messages: importedMessages, title } = this.parseImportData(parsedData);

    // Filter out system messages and prepare messages
    const filteredMessages = importedMessages.filter((m) => m.role !== 'system');

    if (filteredMessages.length === 0) {
      throw new Error('No valid messages to import');
    }

    return this.db.transaction(async (tx) => {
      // Generate new topic ID
      const topicId = idGenerator('topics');

      // Insert topic first
      await tx.insert(topics).values({
        agentId,
        groupId: groupId || null,
        id: topicId,
        title: title || 'Imported Topic',
        userId: this.userId,
        workspaceId: this.workspaceId ?? null,
      });

      const restored = await this.restoreMessages({
        agentId,
        importedMessages: filteredMessages,
        topicId,
        transaction: tx,
      });

      return {
        messageCount: restored.messageCount,
        topicId,
      };
    });
  };

  /**
   * Restore imported messages into a topic that already belongs to the caller's transaction.
   */
  restoreMessages = async ({
    agentId = null,
    importedMessages,
    topicId,
    transaction,
  }: RestoreMessagesParams): Promise<RestoreMessagesResult> => {
    const history = importedMessages.filter((message) => message.role !== 'system');
    if (history.length === 0) return { messageCount: 0 };

    const { messages: preparedMessages, plugins: preparedPlugins } = this.prepareMessages(
      history,
      topicId,
      agentId,
    );

    for (let index = 0; index < preparedMessages.length; index += TOPIC_IMPORT_MESSAGE_BATCH_SIZE) {
      const messageBatch = preparedMessages.slice(index, index + TOPIC_IMPORT_MESSAGE_BATCH_SIZE);
      await transaction.insert(messages).values(messageBatch as any);

      const messageIds = new Set(messageBatch.map((message) => message.id));
      const pluginBatch = preparedPlugins.filter((plugin) => messageIds.has(plugin.id));
      if (pluginBatch.length > 0)
        await transaction.insert(messagePlugins).values(pluginBatch as any);
    }

    return {
      messageCount: preparedMessages.length,
      tailMessageId: preparedMessages.at(-1)?.id,
    };
  };

  /**
   * Parse import data to extract messages and title
   * Supports both simple array format and full ExportedTopic format
   */
  private parseImportData(data: unknown): { messages: ImportedMessage[]; title?: string } {
    // Format 1: Array (simple OpenAI compatible format)
    if (Array.isArray(data)) {
      return { messages: data as ImportedMessage[] };
    }

    // Format 2: ExportedTopic object (full lossless format)
    if (data && typeof data === 'object' && 'version' in data) {
      const fullData = data as ExportedTopic;
      return {
        messages: fullData.messages as ImportedMessage[],
        title: fullData.title,
      };
    }

    throw new Error('Invalid import format: expected array or ExportedTopic object');
  }

  /**
   * Prepare messages with new IDs and rebuild parentId chain
   */
  private prepareMessages(
    importedMessages: ImportedMessage[],
    topicId: string,
    agentId: string | null,
  ): { messages: PreparedMessage[]; plugins: PreparedMessagePlugin[] } {
    const now = Date.now();
    let previousCreatedAt = Number.NEGATIVE_INFINITY;

    // Check if original data has any parentId info (before mapping)
    // This determines whether we should build a linear chain for missing parentIds
    const hasOriginalParentInfo = importedMessages.some(
      (m) => m.parentId !== undefined && m.parentId !== null,
    );

    // Build oldId -> newId mapping
    const idMapping = new Map<string, string>();

    // First pass: generate new IDs and create mapping
    const messagesWithNewIds = importedMessages.map((msg, index) => {
      const newId = idGenerator('messages');

      // If original message has an ID, create mapping
      if (msg.id) {
        idMapping.set(msg.id, newId);
      }

      const createdAt = Math.max(
        this.parseTimestamp(msg.createdAt, now + index),
        previousCreatedAt + 1,
      );
      previousCreatedAt = createdAt;

      return {
        ...msg,
        newId,
        originalParentId: msg.parentId,
        timestamp: createdAt,
        updatedTimestamp: Math.max(this.parseTimestamp(msg.updatedAt, createdAt), createdAt),
      };
    });

    // Second pass: rebuild parentId chain and collect plugin data
    const preparedMessages: PreparedMessage[] = [];
    const preparedPlugins: PreparedMessagePlugin[] = [];

    for (const msg of messagesWithNewIds) {
      let parentId: string | null = null;

      // Try to restore original parentId relationship
      if (msg.originalParentId) {
        parentId = idMapping.get(msg.originalParentId) ?? null;
      }

      // Prepare message (without plugin fields - they go to separate table)
      preparedMessages.push({
        agentId,
        content: msg.content,
        createdAt: new Date(msg.timestamp),
        error: msg.error || null,
        id: msg.newId,
        metadata: msg.metadata || null,
        model: msg.model || null,
        parentId,
        provider: msg.provider || null,
        reasoning: msg.reasoning || null,
        role: msg.role,
        search: msg.search || null,
        tools: msg.tools || null,
        topicId,
        traceId: msg.traceId || null,
        updatedAt: new Date(msg.updatedTimestamp),
        userId: this.userId,
        workspaceId: this.workspaceId ?? null,
      });

      // If message has plugin data (tool messages), prepare plugin record
      if (msg.plugin || msg.pluginState || msg.pluginError || msg.tool_call_id) {
        const plugin = msg.plugin as Record<string, any> | undefined;
        preparedPlugins.push({
          apiName: plugin?.apiName || null,
          arguments: plugin?.arguments || null,
          error: msg.pluginError || null,
          id: msg.newId,
          identifier: plugin?.identifier || null,
          state: msg.pluginState || null,
          toolCallId: msg.tool_call_id || null,
          type: plugin?.type || null,
          userId: this.userId,
          workspaceId: this.workspaceId ?? null,
        });
      }
    }

    // If no parentId info exists in original data (simple format), build linear chain
    if (!hasOriginalParentInfo && preparedMessages.length > 1) {
      for (let i = 1; i < preparedMessages.length; i++) {
        preparedMessages[i].parentId = preparedMessages[i - 1].id;
      }
    }

    return { messages: preparedMessages, plugins: preparedPlugins };
  }

  /**
   * Parse timestamp from various formats
   */
  private parseTimestamp(value: number | string | undefined, fallback: number): number {
    if (value === undefined) {
      return fallback;
    }

    if (typeof value === 'number') {
      return value;
    }

    // Try to parse ISO string
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
}
