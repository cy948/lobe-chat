import { and, count, desc, eq, inArray } from 'drizzle-orm';

import {
  agentEvalDatasets,
  agentEvalExperiments,
  agentEvalRuns,
  type NewAgentEvalRun,
} from '../../schemas';
import { type LobeChatDatabase } from '../../type';
import { buildWorkspaceWhere } from '../../utils/workspace';

export class AgentEvalRunModel {
  private userId: string;
  private db: LobeChatDatabase;
  private workspaceId?: string;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  private ownership = () =>
    buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, agentEvalRuns);

  private buildQueryConditions = (filter?: {
    benchmarkId?: string;
    datasetId?: string;
    experimentId?: string;
    status?: 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'aborted' | 'external';
  }) => {
    const conditions = [this.ownership()];

    if (filter?.datasetId) {
      conditions.push(eq(agentEvalRuns.datasetId, filter.datasetId));
    }

    if (filter?.benchmarkId) {
      const datasetIds = this.db
        .select({ id: agentEvalDatasets.id })
        .from(agentEvalDatasets)
        .where(eq(agentEvalDatasets.benchmarkId, filter.benchmarkId));

      conditions.push(inArray(agentEvalRuns.datasetId, datasetIds));
    }

    if (filter?.status) {
      conditions.push(eq(agentEvalRuns.status, filter.status));
    }

    if (filter?.experimentId) {
      conditions.push(eq(agentEvalRuns.experimentId, filter.experimentId));
    }

    return conditions;
  };

  /**
   * Create a new run
   */
  create = async (params: Omit<NewAgentEvalRun, 'userId'>) => {
    const [result] = await this.db
      .insert(agentEvalRuns)
      .values({ ...params, userId: this.userId, workspaceId: this.workspaceId ?? null })
      .returning();
    return result;
  };

  /**
   * Query runs with optional filters
   */
  query = async (filter?: {
    benchmarkId?: string;
    datasetId?: string;
    experimentId?: string;
    limit?: number;
    offset?: number;
    status?: 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'aborted' | 'external';
  }) => {
    const conditions = this.buildQueryConditions(filter);

    const query = this.db
      .select({
        datasetName: agentEvalDatasets.name,
        experimentName: agentEvalExperiments.name,
        run: agentEvalRuns,
      })
      .from(agentEvalRuns)
      .leftJoin(agentEvalDatasets, eq(agentEvalRuns.datasetId, agentEvalDatasets.id))
      .leftJoin(
        agentEvalExperiments,
        and(
          eq(agentEvalRuns.experimentId, agentEvalExperiments.id),
          buildWorkspaceWhere(
            { userId: this.userId, workspaceId: this.workspaceId },
            agentEvalExperiments,
          ),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(agentEvalRuns.createdAt))
      .$dynamic();

    if (filter?.limit !== undefined) {
      query.limit(filter.limit);
    }

    if (filter?.offset !== undefined) {
      query.offset(filter.offset);
    }

    const rows = await query;

    return rows.map((row) => ({
      ...row.run,
      datasetName: row.datasetName || undefined,
      experimentName: row.experimentName || undefined,
    }));
  };

  count = async (filter?: {
    benchmarkId?: string;
    datasetId?: string;
    experimentId?: string;
    status?: 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'aborted' | 'external';
  }) => {
    const conditions = this.buildQueryConditions(filter);

    const result = await this.db
      .select({ value: count() })
      .from(agentEvalRuns)
      .where(and(...conditions));

    return Number(result[0]?.value) || 0;
  };

  /**
   * Find run by id
   */
  findById = async (id: string) => {
    const [result] = await this.db
      .select()
      .from(agentEvalRuns)
      .where(and(eq(agentEvalRuns.id, id), this.ownership()))
      .limit(1);
    return result;
  };

  /**
   * Update run
   */
  update = async (id: string, value: Partial<NewAgentEvalRun>) => {
    const [result] = await this.db
      .update(agentEvalRuns)
      .set({ ...value, updatedAt: new Date() })
      .where(and(eq(agentEvalRuns.id, id), this.ownership()))
      .returning();
    return result;
  };

  /**
   * Delete run (only user-created runs)
   */
  delete = async (id: string) => {
    return this.db.delete(agentEvalRuns).where(and(eq(agentEvalRuns.id, id), this.ownership()));
  };

  /**
   * Count runs by dataset id
   */
  countByDatasetId = async (datasetId: string) => {
    const result = await this.db
      .select({ value: count() })
      .from(agentEvalRuns)
      .where(and(eq(agentEvalRuns.datasetId, datasetId), this.ownership()));
    return Number(result[0]?.value) || 0;
  };
}
