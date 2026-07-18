import { and, count, desc, eq, inArray, isNull, or } from 'drizzle-orm';

import {
  agentEvalBenchmarks,
  agentEvalDatasets,
  agentEvalExperimentBenchmarks,
  agentEvalExperiments,
  agentEvalRuns,
  type NewAgentEvalExperiment,
} from '../../schemas';
import { type LobeChatDatabase } from '../../type';
import { buildWorkspaceWhere } from '../../utils/workspace';

export class AgentEvalExperimentModel {
  private userId: string;
  private db: LobeChatDatabase;
  private workspaceId?: string;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  private experimentOwnership = () =>
    buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      agentEvalExperiments,
    );

  private junctionOwnership = () =>
    buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      agentEvalExperimentBenchmarks,
    );

  private datasetOwnership = () =>
    buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, agentEvalDatasets);

  private runOwnership = () =>
    buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, agentEvalRuns);

  private normalizeBenchmarkIds = (benchmarkIds: string[]) => [...new Set(benchmarkIds)];

  private ensureVisibleBenchmarks = async (benchmarkIds: string[]) => {
    if (benchmarkIds.length === 0) return;

    const rows = await this.db
      .select({ id: agentEvalBenchmarks.id })
      .from(agentEvalBenchmarks)
      .where(
        and(
          inArray(agentEvalBenchmarks.id, benchmarkIds),
          or(
            buildWorkspaceWhere(
              { userId: this.userId, workspaceId: this.workspaceId },
              agentEvalBenchmarks,
            ),
            isNull(agentEvalBenchmarks.userId),
          ),
        ),
      );

    if (rows.length !== benchmarkIds.length) {
      throw new Error('Benchmarks not found or inaccessible');
    }
  };

  create = async (
    params: Omit<NewAgentEvalExperiment, 'userId' | 'workspaceId'> & {
      benchmarkIds: string[];
    },
  ) => {
    const { benchmarkIds, ...experiment } = params;
    const normalizedBenchmarkIds = this.normalizeBenchmarkIds(benchmarkIds);

    await this.ensureVisibleBenchmarks(normalizedBenchmarkIds);

    return this.db.transaction(async (trx) => {
      const [created] = await trx
        .insert(agentEvalExperiments)
        .values({
          ...experiment,
          userId: this.userId,
          workspaceId: this.workspaceId ?? null,
        })
        .returning();

      if (normalizedBenchmarkIds.length > 0) {
        await trx.insert(agentEvalExperimentBenchmarks).values(
          normalizedBenchmarkIds.map((benchmarkId) => ({
            benchmarkId,
            experimentId: created.id,
            userId: this.userId,
            workspaceId: this.workspaceId ?? null,
          })),
        );
      }

      return created;
    });
  };

  delete = async (id: string) => {
    return this.db.transaction(async (trx) => {
      await trx
        .update(agentEvalRuns)
        .set({ experimentId: null, updatedAt: new Date() })
        .where(and(eq(agentEvalRuns.experimentId, id), this.runOwnership()));

      await trx
        .update(agentEvalDatasets)
        .set({ sourceExperimentId: null, updatedAt: new Date() })
        .where(and(eq(agentEvalDatasets.sourceExperimentId, id), this.datasetOwnership()));

      return trx
        .delete(agentEvalExperiments)
        .where(and(eq(agentEvalExperiments.id, id), this.experimentOwnership()));
    });
  };

  findById = async (id: string) => {
    const [experiment] = await this.db
      .select()
      .from(agentEvalExperiments)
      .where(and(eq(agentEvalExperiments.id, id), this.experimentOwnership()))
      .limit(1);

    if (!experiment) return undefined;

    const benchmarks = await this.db
      .select({
        id: agentEvalBenchmarks.id,
        description: agentEvalBenchmarks.description,
        identifier: agentEvalBenchmarks.identifier,
        isSystem: agentEvalBenchmarks.isSystem,
        name: agentEvalBenchmarks.name,
      })
      .from(agentEvalExperimentBenchmarks)
      .innerJoin(
        agentEvalBenchmarks,
        eq(agentEvalExperimentBenchmarks.benchmarkId, agentEvalBenchmarks.id),
      )
      .where(
        and(
          eq(agentEvalExperimentBenchmarks.experimentId, id),
          this.junctionOwnership(),
          or(
            buildWorkspaceWhere(
              { userId: this.userId, workspaceId: this.workspaceId },
              agentEvalBenchmarks,
            ),
            isNull(agentEvalBenchmarks.userId),
          ),
        ),
      )
      .orderBy(agentEvalBenchmarks.name);

    return { ...experiment, benchmarks };
  };

  findByBenchmarkIds = async (benchmarkIds: string[]) => {
    if (benchmarkIds.length === 0) return [];

    const rows = await this.db
      .select({
        benchmarkId: agentEvalExperimentBenchmarks.benchmarkId,
        experimentId: agentEvalExperiments.id,
        experimentName: agentEvalExperiments.name,
      })
      .from(agentEvalExperimentBenchmarks)
      .innerJoin(
        agentEvalExperiments,
        eq(agentEvalExperimentBenchmarks.experimentId, agentEvalExperiments.id),
      )
      .where(
        and(
          this.junctionOwnership(),
          inArray(agentEvalExperimentBenchmarks.benchmarkId, benchmarkIds),
        ),
      )
      .orderBy(desc(agentEvalExperiments.updatedAt));

    return rows;
  };

  query = async () => {
    const datasetCountSq = this.db
      .select({
        count: count().as('dataset_count'),
        experimentId: agentEvalDatasets.sourceExperimentId,
      })
      .from(agentEvalDatasets)
      .where(this.datasetOwnership())
      .groupBy(agentEvalDatasets.sourceExperimentId)
      .as('dc');

    const runCountSq = this.db
      .select({
        count: count().as('run_count'),
        experimentId: agentEvalRuns.experimentId,
      })
      .from(agentEvalRuns)
      .where(this.runOwnership())
      .groupBy(agentEvalRuns.experimentId)
      .as('rc');

    const rows = await this.db
      .select({
        accessedAt: agentEvalExperiments.accessedAt,
        createdAt: agentEvalExperiments.createdAt,
        datasetCount: datasetCountSq.count,
        description: agentEvalExperiments.description,
        id: agentEvalExperiments.id,
        metadata: agentEvalExperiments.metadata,
        name: agentEvalExperiments.name,
        runCount: runCountSq.count,
        updatedAt: agentEvalExperiments.updatedAt,
        userId: agentEvalExperiments.userId,
      })
      .from(agentEvalExperiments)
      .leftJoin(datasetCountSq, eq(agentEvalExperiments.id, datasetCountSq.experimentId))
      .leftJoin(runCountSq, eq(agentEvalExperiments.id, runCountSq.experimentId))
      .where(this.experimentOwnership())
      .orderBy(desc(agentEvalExperiments.accessedAt), desc(agentEvalExperiments.updatedAt));

    const experimentIds = rows.map((row) => row.id);

    const benchmarkRows =
      experimentIds.length === 0
        ? []
        : await this.db
            .select({
              benchmarkId: agentEvalBenchmarks.id,
              benchmarkName: agentEvalBenchmarks.name,
              experimentId: agentEvalExperimentBenchmarks.experimentId,
            })
            .from(agentEvalExperimentBenchmarks)
            .innerJoin(
              agentEvalBenchmarks,
              eq(agentEvalExperimentBenchmarks.benchmarkId, agentEvalBenchmarks.id),
            )
            .where(
              and(
                this.junctionOwnership(),
                inArray(agentEvalExperimentBenchmarks.experimentId, experimentIds),
                or(
                  buildWorkspaceWhere(
                    { userId: this.userId, workspaceId: this.workspaceId },
                    agentEvalBenchmarks,
                  ),
                  isNull(agentEvalBenchmarks.userId),
                ),
              ),
            )
            .orderBy(agentEvalBenchmarks.name);

    const benchmarkMap = new Map<string, { id: string; name: string }[]>();

    for (const row of benchmarkRows) {
      const list = benchmarkMap.get(row.experimentId) || [];
      list.push({ id: row.benchmarkId, name: row.benchmarkName });
      benchmarkMap.set(row.experimentId, list);
    }

    const experimentsWithRuns = await Promise.all(
      rows.map(async (row) => {
        const recentRuns = await this.db
          .select({
            datasetName: agentEvalDatasets.name,
            run: agentEvalRuns,
          })
          .from(agentEvalRuns)
          .leftJoin(agentEvalDatasets, eq(agentEvalRuns.datasetId, agentEvalDatasets.id))
          .where(and(this.runOwnership(), eq(agentEvalRuns.experimentId, row.id)))
          .orderBy(desc(agentEvalRuns.createdAt))
          .limit(5);

        return {
          ...row,
          benchmarkCount: benchmarkMap.get(row.id)?.length || 0,
          benchmarks: benchmarkMap.get(row.id) || [],
          datasetCount: Number(row.datasetCount) || 0,
          recentRuns: recentRuns.map((item) => ({
            ...item.run,
            datasetName: item.datasetName || undefined,
          })),
          runCount: Number(row.runCount) || 0,
        };
      }),
    );

    return experimentsWithRuns;
  };

  touch = async (id: string) => {
    const [result] = await this.db
      .update(agentEvalExperiments)
      .set({ accessedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(agentEvalExperiments.id, id), this.experimentOwnership()))
      .returning();

    return result;
  };

  update = async (
    id: string,
    params: Partial<Omit<NewAgentEvalExperiment, 'id' | 'userId' | 'workspaceId'>> & {
      benchmarkIds?: string[];
    },
  ) => {
    const { benchmarkIds, ...value } = params;
    const normalizedBenchmarkIds = benchmarkIds
      ? this.normalizeBenchmarkIds(benchmarkIds)
      : undefined;

    if (normalizedBenchmarkIds) {
      await this.ensureVisibleBenchmarks(normalizedBenchmarkIds);
    }

    return this.db.transaction(async (trx) => {
      const [updated] = await trx
        .update(agentEvalExperiments)
        .set({ ...value, updatedAt: new Date() })
        .where(and(eq(agentEvalExperiments.id, id), this.experimentOwnership()))
        .returning();

      if (!updated) return undefined;

      if (normalizedBenchmarkIds) {
        await trx
          .delete(agentEvalExperimentBenchmarks)
          .where(and(eq(agentEvalExperimentBenchmarks.experimentId, id), this.junctionOwnership()));

        if (normalizedBenchmarkIds.length > 0) {
          await trx.insert(agentEvalExperimentBenchmarks).values(
            normalizedBenchmarkIds.map((benchmarkId) => ({
              benchmarkId,
              experimentId: id,
              userId: this.userId,
              workspaceId: this.workspaceId ?? null,
            })),
          );
        }
      }

      return updated;
    });
  };
}
