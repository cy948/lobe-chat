import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PersistentToolCallExecutor } from './persistentToolCallExecutor';

describe('PersistentToolCallExecutor', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'device-tool-calls-'));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it('persists the request before executing and joins concurrent duplicates', async () => {
    const executor = new PersistentToolCallExecutor<{ content: string }>({ directory });
    let release: (() => void) | undefined;
    const run = vi.fn(async () => {
      const entries = await readdir(directory);
      expect(entries).toHaveLength(1);
      expect(
        JSON.parse(await readFile(path.join(directory, entries[0], 'request.json'), 'utf8')),
      ).toMatchObject({ requestId: 'request-1', scope: 'user:1' });
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { content: 'done' };
    });

    const first = executor.execute('user:1', 'request-1', { command: 'echo' }, run);
    const second = executor.execute('user:1', 'request-1', { command: 'echo' }, run);
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    release?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { result: { content: 'done' }, status: 'completed' },
      { result: { content: 'done' }, status: 'completed' },
    ]);
    expect(run).toHaveBeenCalledOnce();
  });

  it('replays a result from disk in a new executor instance', async () => {
    const request = { command: 'echo' };
    const first = new PersistentToolCallExecutor<{ content: string }>({ directory });
    await first.execute('user:1', 'request-1', request, async () => ({ content: 'persisted' }));

    const run = vi.fn(async () => ({ content: 'duplicate' }));
    const restarted = new PersistentToolCallExecutor<{ content: string }>({ directory });
    await expect(restarted.execute('user:1', 'request-1', request, run)).resolves.toEqual({
      result: { content: 'persisted' },
      status: 'completed',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('waits for an active owner in another executor instance', async () => {
    const request = { command: 'echo' };
    const first = new PersistentToolCallExecutor<{ content: string }>({ directory });
    const second = new PersistentToolCallExecutor<{ content: string }>({ directory });
    let release: (() => void) | undefined;
    const firstExecution = first.execute('user:1', 'request-1', request, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { content: 'persisted' };
    });
    await vi.waitFor(() => expect(release).toBeDefined());

    const duplicateRun = vi.fn(async () => ({ content: 'duplicate' }));
    const duplicateExecution = second.execute('user:1', 'request-1', request, duplicateRun);
    let duplicateSettled = false;
    void duplicateExecution.then(() => {
      duplicateSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(duplicateSettled).toBe(false);
    release?.();

    await expect(Promise.all([firstExecution, duplicateExecution])).resolves.toEqual([
      { result: { content: 'persisted' }, status: 'completed' },
      { result: { content: 'persisted' }, status: 'completed' },
    ]);
    expect(duplicateRun).not.toHaveBeenCalled();
  });

  it('returns outcome_unknown after a crash leaves a request without a result', async () => {
    const first = new PersistentToolCallExecutor<{ content: string }>({ directory });
    await expect(
      first.execute('user:1', 'request-1', { command: 'echo' }, async () => {
        throw new Error('process crashed');
      }),
    ).rejects.toThrow('process crashed');

    const run = vi.fn(async () => ({ content: 'duplicate' }));
    const restarted = new PersistentToolCallExecutor<{ content: string }>({ directory });
    await expect(
      restarted.execute('user:1', 'request-1', { command: 'echo' }, run),
    ).resolves.toEqual({ status: 'outcome_unknown' });
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects reuse of a request id with a different payload', async () => {
    const executor = new PersistentToolCallExecutor<{ content: string }>({ directory });
    await executor.execute('user:1', 'request-1', { command: 'one' }, async () => ({
      content: 'done',
    }));

    const run = vi.fn(async () => ({ content: 'duplicate' }));
    await expect(executor.execute('user:1', 'request-1', { command: 'two' }, run)).resolves.toEqual(
      { status: 'conflict' },
    );
    expect(run).not.toHaveBeenCalled();
  });
});
