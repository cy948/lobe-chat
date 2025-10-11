import { boolean, index, integer, pgTable, text, uniqueIndex, varchar, uuid, jsonb } from 'drizzle-orm/pg-core';
import { topics } from './topic';
import { users } from './user';
import type { FlowState, FlowNodeMeta } from '@/types/flow';

export const flowStates = pgTable('flow_states',
    {
        id: uuid('id').defaultRandom().primaryKey(),

        topicId: text('topic_id')
            .references(() => topics.id, { onDelete: 'cascade' })
            .notNull(),

        userId: text('user_id')
            .references(() => users.id, { onDelete: 'cascade' })
            .notNull(),
        
        metadata: jsonb('metadata').$type<FlowState>(),
    }
)

export type NewFlowState = typeof flowStates.$inferInsert;
export type FlowStateItem = typeof flowStates.$inferSelect;

export const flowNodeMeta = pgTable('flow_node_meta',
    {
        // Node id
        id: uuid('id').defaultRandom().primaryKey(),
        flowStateId: uuid('flow_state_id')
            .references(() => flowStates.id, { onDelete: 'cascade' })
            .notNull(),
        userId: text('user_id')
            .references(() => users.id, { onDelete: 'cascade' })
            .notNull(),
        metadata: jsonb('metadata').$type<FlowNodeMeta>().notNull(),
    }
)

export type NewFlowNodeMeta = typeof flowNodeMeta.$inferInsert;
export type FlowNodeMetaItem = typeof flowNodeMeta.$inferSelect;
