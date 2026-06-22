import * as childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { log } from '../utils/logger';
import { checkPlatformCapability } from './checkPlatformCapability';
import { getAgentProfile } from './getAgentProfile';
import { cancelHeteroTask, runHeteroTask } from './heteroTask';
import { runLocalSystemTool } from './localSystemRuntime';

/**
 * CLI-only tools (platform agents). File/shell tools are handled separately by
 * {@link runLocalSystemTool}, which routes them through
 * `LocalSystemExecutionRuntime` so the result carries structured `state`.
 */
const methodMap: Record<string, (args: any) => Promise<unknown>> = {
  cancelHeteroTask,
  checkPlatformCapability,
  getAgentProfile,
  runHeteroTask,
};

const ISOLATED_TOOL_APIS = new Set(['globFiles', 'searchFiles']);
const TOOL_WORKER_ENV = 'LOBEHUB_CLI_TOOL_WORKER';
const DEFAULT_WORKER_TIMEOUT_MS = 120_000;
const WORKER_OUTPUT_TAIL_BYTES = 256;
const WORKER_LOG_DIR_ENV = 'LOBEHUB_TOOL_WORKER_LOG_DIR';
const WORKER_TAIL_BYTES_ENV = 'LOBEHUB_TOOL_WORKER_TAIL_BYTES';

const isToolWorkerProcess = () => process.env[TOOL_WORKER_ENV] === '1';

const resolveWorkerTimeout = (timeout?: number) => {
  if (typeof timeout !== 'number' || !Number.isFinite(timeout)) return DEFAULT_WORKER_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(timeout), 1000), 300_000);
};

const shouldRunInWorker = (apiName: string) =>
  ISOLATED_TOOL_APIS.has(apiName) && !isToolWorkerProcess();

const resolveWorkerTailBytes = () => {
  const raw = process.env[WORKER_TAIL_BYTES_ENV];
  if (!raw) return WORKER_OUTPUT_TAIL_BYTES;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return WORKER_OUTPUT_TAIL_BYTES;
  return parsed;
};

export const isolatedToolWorkerSpawner = {
  spawn(apiName: string, argsStr: string, timeout?: number) {
    return childProcess.spawn(
      process.execPath,
      [
        process.argv[1],
        'internal-tool-worker',
        '--api',
        apiName,
        '--args-b64',
        Buffer.from(argsStr, 'utf8').toString('base64'),
        '--timeout',
        String(timeout ?? ''),
      ],
      {
        env: { ...process.env, [TOOL_WORKER_ENV]: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  },
};

const takeTail = (value: string, maxBytes = resolveWorkerTailBytes()) => {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= maxBytes) return value;
  return buffer.subarray(buffer.length - maxBytes).toString('utf8');
};

const summarizeWorkerOutput = (stdout: string, stderr: string) => {
  const preferred = stderr.trim() || stdout.trim();
  return preferred ? takeTail(preferred) : undefined;
};

const getWorkerLogPaths = (apiName: string) => {
  const logDir = process.env[WORKER_LOG_DIR_ENV];
  if (!logDir) return null;

  fs.mkdirSync(logDir, { recursive: true });
  const prefix = `${apiName}-${process.pid}`;
  return {
    stderr: path.join(logDir, `${prefix}.stderr.log`),
    stdout: path.join(logDir, `${prefix}.stdout.log`),
  };
};

async function executeToolCallInWorker(
  apiName: string,
  argsStr: string,
  timeout?: number,
): Promise<{
  content: string;
  error?: string;
  state?: unknown;
  success: boolean;
}> {
  const entrypoint = process.argv[1];

  if (!entrypoint) {
    return {
      content: '',
      error: 'CLI entrypoint is unavailable for isolated tool execution',
      success: false,
    };
  }

  return new Promise((resolve) => {
    const workerTimeout = resolveWorkerTimeout(timeout);
    const child = isolatedToolWorkerSpawner.spawn(apiName, argsStr, timeout);
    const logPaths = getWorkerLogPaths(apiName);

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: {
      content: string;
      error?: string;
      state?: unknown;
      success: boolean;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({
        content: '',
        error: `Isolated tool worker timed out after ${workerTimeout}ms`,
        success: false,
      });
    }, workerTimeout);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (logPaths) fs.appendFileSync(logPaths.stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (logPaths) fs.appendFileSync(logPaths.stderr, chunk);
    });
    child.on('error', (error) => {
      finish({ content: '', error: error.message, success: false });
    });
    child.on('close', (code, signal) => {
      const output = stdout.trim();
      if (output) {
        try {
          finish(JSON.parse(output));
          return;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const tail = summarizeWorkerOutput(stdout, stderr);
          finish({
            content: '',
            error: tail
              ? `Isolated tool worker returned invalid JSON: ${errorMsg}. Tail: ${tail}`
              : `Isolated tool worker returned invalid JSON: ${errorMsg}`,
            success: false,
          });
          return;
        }
      }

      const exitReason = signal
        ? `signal ${signal}`
        : typeof code === 'number'
          ? `exit code ${code}`
          : 'unknown exit';
      const tail = summarizeWorkerOutput(stdout, stderr);
      finish({
        content: '',
        error: tail
          ? `Isolated tool worker failed with ${exitReason}: ${tail}`
          : `Isolated tool worker failed with ${exitReason}`,
        success: false,
      });
    });
  });
}

export async function executeToolCallDirect(
  apiName: string,
  argsStr: string,
  timeout?: number,
): Promise<{
  content: string;
  error?: string;
  state?: unknown;
  success: boolean;
}> {
  let args: Record<string, any>;
  try {
    args = JSON.parse(argsStr);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Tool call failed: ${apiName} - ${errorMsg}`);
    return { content: '', error: errorMsg, success: false };
  }

  const finalArgs =
    typeof timeout === 'number' && Number.isFinite(timeout) && !('timeout' in args)
      ? { ...args, timeout }
      : args;

  try {
    // File/shell tools route through LocalSystemExecutionRuntime so `content` is
    // the formatted prompt text and `state` carries the structured payload for
    // client renders — matching the desktop gateway path (PR #15114).
    const localResult = await runLocalSystemTool(apiName, finalArgs);
    if (localResult) {
      const { error } = localResult;
      return {
        content: localResult.content,
        error:
          error instanceof Error ? error.message : typeof error === 'string' ? error : undefined,
        state: localResult.state,
        success: localResult.success,
      };
    }

    // CLI-only tools return raw domain payloads, serialized into `content`.
    const handler = methodMap[apiName];
    if (!handler) {
      return { content: '', error: `Unknown tool API: ${apiName}`, success: false };
    }

    const result = await handler(finalArgs);
    const content = typeof result === 'string' ? result : JSON.stringify(result);

    return { content, success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Tool call failed: ${apiName} - ${errorMsg}`);
    return { content: '', error: errorMsg, success: false };
  }
}

export async function executeToolCall(
  apiName: string,
  argsStr: string,
  timeout?: number,
): Promise<{
  content: string;
  error?: string;
  state?: unknown;
  success: boolean;
}> {
  if (shouldRunInWorker(apiName)) return executeToolCallInWorker(apiName, argsStr, timeout);
  return executeToolCallDirect(apiName, argsStr, timeout);
}
