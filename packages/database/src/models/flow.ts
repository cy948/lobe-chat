import { and, count, desc, eq, gt, ilike, inArray, isNull, sql } from 'drizzle-orm';

import { flowNodeMeta, flowStates, FlowNodeMetaItem, messages } from '../schemas';
import { LobeChatDatabase } from '../type';
import { FlowNodeMeta, FlowState } from '@/types/flow';
import { PartialDeep } from 'type-fest';

import { merge } from '@/utils/merge';

interface CreateFlowStateParams {
    topicId: string;
    metadata: FlowState;
}

export class FlowStateModel {
    private userId: string;
    private db: LobeChatDatabase;

    constructor(db: LobeChatDatabase, userId: string) {
        this.userId = userId;
        this.db = db;
    }

    findByTopicId = async (topicId: string) => {
        return await this.db.query.flowStates.findFirst({
            where: and(eq(flowStates.topicId, topicId), eq(flowStates.userId, this.userId)),
            // with: withNodeMeta ? {
            //     nodeMeta: true,
            // } : undefined,
        });
    }

    findById = async (id: string) => {
        return await this.db.query.flowStates.findFirst({
            where: and(eq(flowStates.id, id), eq(flowStates.userId, this.userId)),
            with: {
                nodeMeta: true,
            }
        });
    }

    create = async (flowState: CreateFlowStateParams) => {
        const [state] = await this.db.insert(flowStates).values({
            ...flowState,
            userId: this.userId,
        }).returning();
        return state
    }

    update = async (id: string, flowState: Partial<FlowState>) => {
        const prevState = await this.findById(id);
        if (!prevState) {
            return
        }
        const [state] = await this.db.update(flowStates).set({
            metadata: merge(prevState.metadata, flowState),
        }).where(and(eq(flowStates.id, id), eq(flowStates.userId, this.userId))).returning();
        return state;
    }

    delete = async (id: string) => {
        await this.db.delete(flowStates).where(and(eq(flowStates.id, id), eq(flowStates.userId, this.userId)));
    }

}

interface CreateFlowMetaDataParams {
    metadata: Exclude<FlowNodeMeta, 'messages'>;
    flowStateId: string;
}

export class FlowMetaDataModel {
    private userId: string;
    private db: LobeChatDatabase;

    constructor(db: LobeChatDatabase, userId: string) {
        this.userId = userId;
        this.db = db;
    }

    findById = async (id: string) => {
        return await this.db.query.flowNodeMeta.findFirst({
            where: and(eq(flowNodeMeta.id, id), eq(flowNodeMeta.userId, this.userId)),
        });
    }

    create = async (flowMeta: CreateFlowMetaDataParams) => {
        const [meta] = await this.db.insert(flowNodeMeta).values({
            ...flowMeta,
            userId: this.userId,
        }).returning();
        return meta;
    }

    update = async (id: string, flowMeta: Partial<Exclude<FlowNodeMeta, 'messages'>>) => {
        const prevMeta = await this.findById(id);
        if (!prevMeta) {
            return;
        }
        const [meta] = await this.db.update(flowNodeMeta).set({
            ...flowMeta,
            metadata: merge(prevMeta.metadata, flowMeta),
            userId: this.userId,
        }).where(and(eq(flowNodeMeta.id, id), eq(flowNodeMeta.userId, this.userId))).returning();
        return meta;
    }

    delete = async (id: string) => {
        // Get the meta first
        const meta = await this.findById(id);
        if (!meta) return;
        // If has messages, delete it
        if (meta.metadata.messageIds.length > 0) {
            for (const messageId of meta.metadata.messageIds) {
                await this.db.delete(messages).where(and(eq(messages.id, messageId), eq(messages.userId, this.userId)));
            }
            return;
        }
        await this.db.delete(flowNodeMeta).where(and(eq(flowNodeMeta.id, id), eq(flowNodeMeta.userId, this.userId)));
    }

}

