import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type { ToolCallResponseMessage } from './types';

const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const ACTIVE_OWNER_WAIT_MS = 45_000;
const ACTIVE_OWNER_POLL_MS = 25;

interface RequestRecord {
  fingerprint: string;
  ownerPid: number;
  receivedAt: number;
  requestId: string;
  scope: string;
}

interface ResultRecord<TResult> {
  completedAt: number;
  fingerprint: string;
  result: TResult;
}

export type PersistentToolCallExecution<TResult> =
  { result: TResult; status: 'completed' } | { status: 'conflict' | 'outcome_unknown' };

export interface PersistentToolCallExecutorOptions {
  directory: string;
  retentionMs?: number;
}

export const resolveToolCallExecutionResult = (
  execution: PersistentToolCallExecution<ToolCallResponseMessage['result']>,
): ToolCallResponseMessage['result'] => {
  if (execution.status === 'completed') return execution.result;

  const conflict = execution.status === 'conflict';
  return {
    content: conflict
      ? 'The request ID was reused with a different tool call.'
      : 'The device restarted after accepting this tool call, so its outcome is unknown.',
    error: conflict ? 'REQUEST_ID_CONFLICT' : 'OUTCOME_UNKNOWN',
    success: false,
  };
};

const isNodeError = (error: unknown): error is NodeJS.ErrnoException => error instanceof Error;

const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError(error) && error.code === 'EPERM';
  }
};

export class PersistentToolCallExecutor<TResult> {
  private readonly directory: string;
  private readonly retentionMs: number;
  private readonly inFlight = new Map<
    string,
    { fingerprint: string; promise: Promise<PersistentToolCallExecution<TResult>> }
  >();
  private lastPrunedAt = 0;

  constructor(options: PersistentToolCallExecutorOptions) {
    this.directory = options.directory;
    this.retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
  }

  async execute(
    scope: string,
    requestId: string,
    request: unknown,
    run: () => Promise<TResult>,
  ): Promise<PersistentToolCallExecution<TResult>> {
    const key = createHash('sha256').update(scope).update('\0').update(requestId).digest('hex');
    const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const active = this.inFlight.get(key);
    if (active) {
      return active.fingerprint === fingerprint ? active.promise : { status: 'conflict' };
    }

    const execution = this.executePersisted({ fingerprint, key, requestId, run, scope });
    this.inFlight.set(key, { fingerprint, promise: execution });
    try {
      return await execution;
    } finally {
      this.inFlight.delete(key);
      void this.pruneExpired().catch(() => {});
    }
  }

  private async executePersisted(params: {
    fingerprint: string;
    key: string;
    requestId: string;
    run: () => Promise<TResult>;
    scope: string;
  }): Promise<PersistentToolCallExecution<TResult>> {
    const { fingerprint, key, requestId, run, scope } = params;
    await mkdir(this.directory, { mode: 0o700, recursive: true });
    const recordDirectory = path.join(this.directory, key);

    try {
      await mkdir(recordDirectory, { mode: 0o700 });
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'EEXIST') throw error;
      return this.readExisting(recordDirectory, fingerprint);
    }

    await this.writeDurableJson(path.join(recordDirectory, 'request.json'), {
      fingerprint,
      ownerPid: process.pid,
      receivedAt: Date.now(),
      requestId,
      scope,
    } satisfies RequestRecord);

    let result: TResult;
    try {
      result = await run();
    } catch (error) {
      await this.writeDurableJson(path.join(recordDirectory, 'abandoned.json'), {
        abandonedAt: Date.now(),
      });
      throw error;
    }
    const temporaryResult = path.join(recordDirectory, `result-${randomUUID()}.tmp`);
    await this.writeDurableJson(temporaryResult, {
      completedAt: Date.now(),
      fingerprint,
      result,
    } satisfies ResultRecord<TResult>);
    await rename(temporaryResult, path.join(recordDirectory, 'result.json'));
    return { result, status: 'completed' };
  }

  private async readExisting(
    recordDirectory: string,
    fingerprint: string,
  ): Promise<PersistentToolCallExecution<TResult>> {
    const waitUntil = Date.now() + ACTIVE_OWNER_WAIT_MS;
    while (true) {
      const result = await this.readJson<ResultRecord<TResult>>(
        path.join(recordDirectory, 'result.json'),
      );
      if (result) {
        return result.fingerprint === fingerprint
          ? { result: result.result, status: 'completed' }
          : { status: 'conflict' };
      }

      const request = await this.readJson<RequestRecord>(
        path.join(recordDirectory, 'request.json'),
      );
      if (request?.fingerprint !== undefined && request.fingerprint !== fingerprint) {
        return { status: 'conflict' };
      }
      const abandoned = await this.readJson(path.join(recordDirectory, 'abandoned.json'));
      if (abandoned || (request && !isProcessAlive(request.ownerPid))) {
        return { status: 'outcome_unknown' };
      }
      if (Date.now() >= waitUntil) return { status: 'outcome_unknown' };
      await delay(ACTIVE_OWNER_POLL_MS);
    }
  }

  private async readJson<T>(filePath: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(filePath, 'utf8')) as T;
    } catch (error) {
      if ((isNodeError(error) && error.code === 'ENOENT') || error instanceof SyntaxError) {
        return undefined;
      }
      throw error;
    }
  }

  private async writeDurableJson(filePath: string, value: unknown) {
    const file = await open(filePath, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
  }

  private async pruneExpired() {
    const now = Date.now();
    if (now - this.lastPrunedAt < PRUNE_INTERVAL_MS) return;
    this.lastPrunedAt = now;

    const entries = await readdir(this.directory, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !this.inFlight.has(entry.name))
        .map(async (entry) => {
          const recordDirectory = path.join(this.directory, entry.name);
          const metadata = await stat(recordDirectory);
          if (now - metadata.mtimeMs >= this.retentionMs) {
            await rm(recordDirectory, { force: true, recursive: true });
          }
        }),
    );
  }
}
