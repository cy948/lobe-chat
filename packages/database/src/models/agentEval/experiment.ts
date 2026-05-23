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

export class AgentEvalExperimentModel {
  private userId: string;
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase, userId: string) {
    this.db = db;
    this.userId = userId;
  }

  create = async (
    params: Omit<NewAgentEvalExperiment, 'userId'> & {
      benchmarkIds: string[];
    },
  ) => {
    const { benchmarkIds, ...experiment } = params;

    const [created] = await this.db
      .insert(agentEvalExperiments)
      .values({ ...experiment, userId: this.userId })
      .returning();

    if (benchmarkIds.length > 0) {
      await this.db.insert(agentEvalExperimentBenchmarks).values(
        benchmarkIds.map((benchmarkId) => ({
          benchmarkId,
          experimentId: created.id,
          userId: this.userId,
        })),
      );
    }

    return created;
  };

  delete = async (id: string) => {
    return this.db.transaction(async (trx) => {
      await trx
        .update(agentEvalRuns)
        .set({ experimentId: null, updatedAt: new Date() })
        .where(and(eq(agentEvalRuns.experimentId, id), eq(agentEvalRuns.userId, this.userId)));

      await trx
        .update(agentEvalDatasets)
        .set({ sourceExperimentId: null, updatedAt: new Date() })
        .where(
          and(
            eq(agentEvalDatasets.sourceExperimentId, id),
            eq(agentEvalDatasets.userId, this.userId),
          ),
        );

      return trx
        .delete(agentEvalExperiments)
        .where(and(eq(agentEvalExperiments.id, id), eq(agentEvalExperiments.userId, this.userId)));
    });
  };

  findById = async (id: string) => {
    const [experiment] = await this.db
      .select()
      .from(agentEvalExperiments)
      .where(
        and(
          eq(agentEvalExperiments.id, id),
          or(eq(agentEvalExperiments.userId, this.userId), isNull(agentEvalExperiments.userId)),
        ),
      )
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
      .where(eq(agentEvalExperimentBenchmarks.experimentId, id))
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
          eq(agentEvalExperimentBenchmarks.userId, this.userId),
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
      .where(eq(agentEvalDatasets.userId, this.userId))
      .groupBy(agentEvalDatasets.sourceExperimentId)
      .as('dc');

    const runCountSq = this.db
      .select({
        count: count().as('run_count'),
        experimentId: agentEvalRuns.experimentId,
      })
      .from(agentEvalRuns)
      .where(eq(agentEvalRuns.userId, this.userId))
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
      .where(or(eq(agentEvalExperiments.userId, this.userId), isNull(agentEvalExperiments.userId)))
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
                eq(agentEvalExperimentBenchmarks.userId, this.userId),
                inArray(agentEvalExperimentBenchmarks.experimentId, experimentIds),
              ),
            )
            .orderBy(agentEvalBenchmarks.name);

    const benchmarkMap = new Map<string, { id: string; name: string }[]>();

    for (const row of benchmarkRows) {
      const list = benchmarkMap.get(row.experimentId) || [];
      list.push({ id: row.benchmarkId, name: row.benchmarkName });
      benchmarkMap.set(row.experimentId, list);
    }

    return rows.map((row) => ({
      ...row,
      benchmarkCount: benchmarkMap.get(row.id)?.length || 0,
      benchmarks: benchmarkMap.get(row.id) || [],
      datasetCount: Number(row.datasetCount) || 0,
      runCount: Number(row.runCount) || 0,
    }));
  };

  touch = async (id: string) => {
    const [result] = await this.db
      .update(agentEvalExperiments)
      .set({ accessedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(agentEvalExperiments.id, id), eq(agentEvalExperiments.userId, this.userId)))
      .returning();

    return result;
  };

  update = async (
    id: string,
    params: Partial<Omit<NewAgentEvalExperiment, 'id' | 'userId'>> & { benchmarkIds?: string[] },
  ) => {
    const { benchmarkIds, ...value } = params;

    const [updated] = await this.db
      .update(agentEvalExperiments)
      .set({ ...value, updatedAt: new Date() })
      .where(and(eq(agentEvalExperiments.id, id), eq(agentEvalExperiments.userId, this.userId)))
      .returning();

    if (!updated) return undefined;

    if (benchmarkIds) {
      await this.db
        .delete(agentEvalExperimentBenchmarks)
        .where(
          and(
            eq(agentEvalExperimentBenchmarks.experimentId, id),
            eq(agentEvalExperimentBenchmarks.userId, this.userId),
          ),
        );

      if (benchmarkIds.length > 0) {
        await this.db.insert(agentEvalExperimentBenchmarks).values(
          benchmarkIds.map((benchmarkId) => ({
            benchmarkId,
            experimentId: id,
            userId: this.userId,
          })),
        );
      }
    }

    return updated;
  };
}
