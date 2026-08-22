import type { LobeChatDatabase } from '@lobechat/database';
import { idGenerator } from '@lobechat/database';
import type { ImportedMessage } from '@lobechat/types';

import { agentEvalRunTopics, messagePlugins, messages, topics } from '@/database/schemas';

const EVAL_HISTORY_TAIL_METADATA_KEY = 'evalHistoryTailMessageId';

export interface EvalRunTopicProvisionCase {
  content: {
    input: string;
    messages?: ImportedMessage[];
  };
  id: string;
  sortOrder: number | null;
}

interface PreparedHistory {
  messages: (typeof messages.$inferInsert)[];
  plugins: (typeof messagePlugins.$inferInsert)[];
  tailMessageId?: string;
}

const parseTimestamp = (value: number | string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  if (typeof value === 'number') return value;

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const prepareHistory = (
  importedMessages: ImportedMessage[],
  topicId: string,
  userId: string,
  workspaceId?: string,
): PreparedHistory => {
  const history = importedMessages.filter((message) => message.role !== 'system');
  if (history.length === 0) return { messages: [], plugins: [] };

  const now = Date.now();
  const idMapping = new Map<string, string>();
  const hasParentInfo = history.some((message) => message.parentId != null);
  const messagesWithIds = history.map((message, index) => {
    const id = idGenerator('messages');
    if (message.id) idMapping.set(message.id, id);

    return {
      ...message,
      id,
      originalParentId: message.parentId,
      createdAt: parseTimestamp(message.createdAt, now + index),
      updatedAt: parseTimestamp(message.updatedAt, now + index),
    };
  });

  const preparedMessages: PreparedHistory['messages'] = [];
  const plugins: PreparedHistory['plugins'] = [];

  for (const message of messagesWithIds) {
    preparedMessages.push({
      agentId: null,
      content: message.content,
      createdAt: new Date(message.createdAt),
      error: message.error ?? null,
      id: message.id,
      metadata: message.metadata ?? null,
      model: message.model ?? null,
      parentId: message.originalParentId ? (idMapping.get(message.originalParentId) ?? null) : null,
      provider: message.provider ?? null,
      reasoning: message.reasoning ?? null,
      role: message.role,
      search: message.search ?? null,
      tools: message.tools ?? null,
      topicId,
      traceId: message.traceId ?? null,
      updatedAt: new Date(message.updatedAt),
      userId,
      workspaceId: workspaceId ?? null,
    });

    if (message.plugin || message.pluginState || message.pluginError || message.tool_call_id) {
      const plugin = message.plugin;
      plugins.push({
        apiName: plugin?.apiName ?? null,
        arguments: plugin?.arguments ?? null,
        error: message.pluginError ?? null,
        id: message.id,
        identifier: plugin?.identifier ?? null,
        state: message.pluginState ?? null,
        toolCallId: message.tool_call_id ?? null,
        type: plugin?.type ?? null,
        userId,
        workspaceId: workspaceId ?? null,
      });
    }
  }

  if (!hasParentInfo) {
    for (let index = 1; index < preparedMessages.length; index++) {
      preparedMessages[index].parentId = preparedMessages[index - 1].id!;
    }
  }

  return { messages: preparedMessages, plugins, tailMessageId: preparedMessages.at(-1)!.id };
};

export const provisionRunTopics = async ({
  db,
  runId,
  targetAgentId,
  testCases,
  userId,
  workspaceId,
}: {
  db: LobeChatDatabase;
  runId: string;
  targetAgentId?: string | null;
  testCases: EvalRunTopicProvisionCase[];
  userId: string;
  workspaceId?: string;
}) =>
  db.transaction(async (tx) => {
    const preparedCases = testCases.map((testCase) => {
      const topicId = idGenerator('topics');
      const history = testCase.content.messages
        ? prepareHistory(testCase.content.messages, topicId, userId, workspaceId)
        : undefined;

      return { history, testCase, topicId };
    });

    await tx.insert(topics).values(
      preparedCases.map(({ history, testCase, topicId }) => ({
        agentId: targetAgentId ?? null,
        id: topicId,
        metadata: history?.tailMessageId
          ? { [EVAL_HISTORY_TAIL_METADATA_KEY]: history.tailMessageId }
          : undefined,
        title: `[Eval Case #${(testCase.sortOrder ?? 0) + 1}] ${testCase.content.input.slice(0, 50) || 'Test Case'}...`,
        trigger: 'eval',
        userId,
        workspaceId: workspaceId ?? null,
      })),
    );

    const importedMessages = preparedCases.flatMap(({ history }) => history?.messages ?? []);
    if (importedMessages.length > 0) await tx.insert(messages).values(importedMessages);

    const importedPlugins = preparedCases.flatMap(({ history }) => history?.plugins ?? []);
    if (importedPlugins.length > 0) await tx.insert(messagePlugins).values(importedPlugins);

    await tx.insert(agentEvalRunTopics).values(
      preparedCases.map(({ testCase, topicId }) => ({
        runId,
        status: 'pending' as const,
        testCaseId: testCase.id,
        topicId,
        userId,
        workspaceId: workspaceId ?? null,
      })),
    );

    return preparedCases.map(({ topicId }) => topicId);
  });
