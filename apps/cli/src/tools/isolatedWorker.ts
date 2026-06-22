import * as childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

export const shouldRunInWorker = (apiName: string) =>
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

type ToolCallResult = {
  content: string;
  error?: string;
  state?: unknown;
  success: boolean;
};

export async function executeToolCallInWorker(
  apiName: string,
  argsStr: string,
  timeout?: number,
): Promise<ToolCallResult> {
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

    const finish = (result: ToolCallResult) => {
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
      if (code === 0 && !signal) {
        const output = stdout.trim();
        if (!output) {
          finish({ content: '', error: 'Isolated tool worker produced no output', success: false });
          return;
        }

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
