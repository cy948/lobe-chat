import { FileSnapshotStore, type ISnapshotStore } from '@lobechat/agent-tracing';

import { S3SnapshotStore } from '@/server/modules/AgentTracing';

const ENABLE_AGENT_S3_TRACING_VALUE = '1';
const ENABLE_AGENT_FILE_TRACING_VALUE = '1';

export const shouldUseAgentS3Tracing = () => {
  const explicitValue = process.env.ENABLE_AGENT_S3_TRACING;

  if (explicitValue !== undefined) return explicitValue === ENABLE_AGENT_S3_TRACING_VALUE;
  if (process.env.ENABLE_AGENT_FILE_TRACING === ENABLE_AGENT_FILE_TRACING_VALUE) return false;

  return process.env.NODE_ENV === 'production';
};

export const shouldUseAgentFileTracing = () => {
  const explicitValue = process.env.ENABLE_AGENT_FILE_TRACING;

  if (explicitValue !== undefined) return explicitValue === ENABLE_AGENT_FILE_TRACING_VALUE;

  return process.env.NODE_ENV === 'development';
};

/**
 * Constructor injection for tests. The defaults are the statically-imported
 * stores — never load them via a dynamic `require(moduleName)`: the module name
 * goes through an indirection the bundler can't statically analyze, so the `@/`
 * build-time alias fails to resolve at runtime and the store silently becomes
 * `null` (this once disabled ALL production snapshots).
 */
export interface SnapshotStoreFactories {
  createFile?: () => ISnapshotStore;
  createS3?: () => ISnapshotStore;
}

/**
 * Create default snapshot store based on environment.
 * - ENABLE_AGENT_S3_TRACING=1 -> S3SnapshotStore
 * - ENABLE_AGENT_FILE_TRACING=1 -> FileSnapshotStore
 * - NODE_ENV=production with tracing envs unset -> S3SnapshotStore
 * - NODE_ENV=development -> FileSnapshotStore
 * - Otherwise -> null (no tracing)
 */
export const createDefaultSnapshotStore = (
  factories: SnapshotStoreFactories = {},
): ISnapshotStore | null => {
  if (shouldUseAgentS3Tracing()) {
    try {
      return (factories.createS3 ?? (() => new S3SnapshotStore()))();
    } catch (e) {
      // Tracing is best-effort — a misconfigured S3 (e.g. missing creds) must
      // never break the agent run. But surface it loudly: a swallowed failure
      // here previously disabled all production snapshots without a trace.
      console.error('[snapshotStore] failed to create S3SnapshotStore, tracing disabled:', e);
      return null;
    }
  }

  if (shouldUseAgentFileTracing()) {
    return (factories.createFile ?? (() => new FileSnapshotStore()))();
  }

  return null;
};
