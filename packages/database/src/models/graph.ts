import { and, desc, eq } from 'drizzle-orm';

import { CanvasState, GraphNodeMeta } from '@/types/graph';

import { graphNodes, graphState } from '../schemas';
import { LobeChatDatabase } from '../type';

export class GraphStateModel {
  private userId: string;
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase, userId: string) {
    this.userId = userId;
    this.db = db;
  }

  findById = async (id: string) => {
    return await this.db.query.graphState.findFirst({
      where: and(eq(graphState.id, id), eq(graphState.userId, this.userId)),
      with: {
        nodes: {
          with: {
            messages: true,
          },
        },
      },
    });
  };

  findLatest = async () => {
    return await this.db.query.graphState.findFirst({
      orderBy: [desc(graphState.id)],
      where: eq(graphState.userId, this.userId),
      with: {
        nodes: {
          with: {
            messages: true,
          },
        },
      },
    });
  };

  findAll = async () => {
    return await this.db.query.graphState.findMany({
      orderBy: [desc(graphState.updatedAt)],
      where: eq(graphState.userId, this.userId),
    });
  };

  create = async (state: CanvasState) => {
    const [newState] = await this.db
      .insert(graphState)
      .values({
        state,
        userId: this.userId,
      })
      .returning();
    return newState;
  };

  update = async (id: string, state: Partial<CanvasState>) => {
    const prevState = await this.findById(id);
    if (!prevState) {
      return;
    }
    const [newState] = await this.db
      .update(graphState)
      .set({
        state: {
          ...prevState.state,
          ...state,
        },
        updatedAt: new Date(),
      })
      .where(and(eq(graphState.id, id), eq(graphState.userId, this.userId)))
      .returning();
    return newState;
  };

  delete = async (id: string) => {
    await this.db
      .delete(graphState)
      .where(and(eq(graphState.id, id), eq(graphState.userId, this.userId)));
  };
}

export class GraphNodeModel {
  private userId: string;
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase, userId: string) {
    this.userId = userId;
    this.db = db;
  }

  findById = async (id: string) => {
    return await this.db.query.graphNodes.findFirst({
      where: and(eq(graphNodes.id, id), eq(graphNodes.userId, this.userId)),
      with: {
        messages: true,
      },
    });
  };

  findByStateId = async (stateId: string) => {
    return await this.db.query.graphNodes.findMany({
      where: and(eq(graphNodes.stateId, stateId), eq(graphNodes.userId, this.userId)),
      with: {
        messages: true,
      },
    });
  };

  create = async (stateId: string, meta: Partial<GraphNodeMeta>) => {
    const [node] = await this.db
      .insert(graphNodes)
      .values({
        meta: {
          summary: meta.summary || '',
          title: meta.title || '',
          type: meta.type || 'chat',
          useSummary: meta.useSummary || false,
        },
        stateId,
        userId: this.userId,
      })
      .returning();
    return node;
  };

  update = async (id: string, meta: Partial<GraphNodeMeta>) => {
    const prevNode = await this.findById(id);
    if (!prevNode) {
      return;
    }
    const [node] = await this.db
      .update(graphNodes)
      .set({
        meta: {
          ...prevNode.meta,
          ...meta,
        },
        updatedAt: new Date(),
      })
      .where(and(eq(graphNodes.id, id), eq(graphNodes.userId, this.userId)))
      .returning();
    return node;
  };

  delete = async (id: string) => {
    await this.db
      .delete(graphNodes)
      .where(and(eq(graphNodes.id, id), eq(graphNodes.userId, this.userId)));
  };
}
