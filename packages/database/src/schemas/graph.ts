import { pgTable, text, uuid, jsonb } from 'drizzle-orm/pg-core';
import { CanvasState, GraphNodeMeta } from '@/types/graph';
import { users } from './user';

export const graphState = pgTable('graph_states', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
        .references(() => users.id, { onDelete: 'cascade' })
        .notNull(),
    state: jsonb('state').notNull().$type<CanvasState>(),
})

export type NewGraphState = typeof graphState.$inferInsert;
export type GraphStateItem = typeof graphState.$inferSelect;

export const graphNodes = pgTable('graph_nodes', {
    id: uuid('id').defaultRandom().primaryKey(),
    stateId: uuid('graph_state_id')
        .references(() => graphState.id, { onDelete: 'cascade' })
        .notNull(),
    userId: text('user_id')
        .references(() => users.id, { onDelete: 'cascade' })
        .notNull(),
    meta: jsonb('meta').notNull().$type<GraphNodeMeta>(),
})

export type NewGraphNode = typeof graphNodes.$inferInsert;
export type GraphNodeItem = typeof graphNodes.$inferSelect;
