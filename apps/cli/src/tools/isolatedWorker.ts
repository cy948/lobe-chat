import * as childProcess from 'node:child_process';

const ISOLATED_TOOL_APIS = new Set(['globFiles', 'searchFiles']);
const TOOL_WORKER_ENV = 'LOBEHUB_CLI_TOOL_WORKER';
const DEFAULT_WORKER_TIMEOUT_MS = 120_000;

const isToolWorkerProcess = () => process.env[TOOL_WORKER_ENV] === '1';

export const shouldRunInWorker = (apiName: string) =>
  ISOLATED_TOOL_APIS.has(apiName) && !isToolWorkerProcess();

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
    const workerTimeout =
      typeof timeout === 'number' && Number.isFinite(timeout)
        ? Math.min(Math.max(Math.trunc(timeout), 1000), 300_000)
        : DEFAULT_WORKER_TIMEOUT_MS;
    const child = childProcess.spawn(
      process.execPath,
      [
        entrypoint,
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

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: ToolCallResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const summarizeOutput = () => stderr.trim() || stdout.trim() || undefined;

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
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
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
          const workerOutput = summarizeOutput();
          finish({
            content: '',
            error: workerOutput
              ? `Isolated tool worker returned invalid JSON: ${errorMsg}. Output: ${workerOutput}`
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
      const workerOutput = summarizeOutput();
      finish({
        content: '',
        error: workerOutput
          ? `Isolated tool worker failed with ${exitReason}: ${workerOutput}`
          : `Isolated tool worker failed with ${exitReason}`,
        success: false,
      });
    });
  });
}
