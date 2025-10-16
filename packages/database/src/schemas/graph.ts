import { boolean, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { CanvasState, GraphNodeMeta } from '@/types/graph';

import { timestamps } from './_helpers';
import { users } from './user';

export const graphState = pgTable('graph_states', {
  favorite: boolean('favorite').default(false),
  id: uuid('id').defaultRandom().primaryKey(),
  state: jsonb('state').notNull().$type<CanvasState>(),
  title: text('title').default('New Graph'),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  ...timestamps,
});

export type NewGraphState = typeof graphState.$inferInsert;
export type GraphStateItem = typeof graphState.$inferSelect;

export const graphNodes = pgTable('graph_nodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  meta: jsonb('meta').notNull().$type<GraphNodeMeta>(),
  stateId: uuid('graph_state_id')
    .references(() => graphState.id, { onDelete: 'cascade' })
    .notNull(),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  ...timestamps,
});

export type NewGraphNode = typeof graphNodes.$inferInsert;
export type GraphNodeItem = typeof graphNodes.$inferSelect;
