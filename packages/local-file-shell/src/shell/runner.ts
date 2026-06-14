import { spawn } from 'node:child_process';
import fs from 'node:fs';

import type { RunCommandParams, RunCommandResult } from '../types';
import type { ShellOutputFiles, ShellProcess, ShellProcessManager } from './process-manager';
import { getShellConfig } from './utils';

export interface RunCommandOptions {
  logger?: {
    debug: (...args: any[]) => void;
    error: (...args: any[]) => void;
    info: (...args: any[]) => void;
  };
  processManager: ShellProcessManager;
}

export async function runCommand(
  {
    command,
    cwd,
    description,
    env: extraEnv,
    run_in_background,
    timeout = 30_000,
  }: RunCommandParams,
  { processManager, logger }: RunCommandOptions,
): Promise<RunCommandResult> {
  if (!command) {
    return { error: 'command is required', success: false };
  }

  const logPrefix = `[runCommand: ${description || command.slice(0, 50)}]`;
  logger?.debug(`${logPrefix} Starting`, { background: run_in_background, cwd, timeout });

  const shellConfig = getShellConfig(command);
  const childEnv = extraEnv ? { ...process.env, ...extraEnv } : process.env;

  try {
    const shellId = processManager.createShellId();
    const outputFiles = processManager.createOutputFiles(shellId);
    const childProcess = spawn(shellConfig.cmd, shellConfig.args, {
      cwd,
      env: childEnv,
      shell: false,
    });

    const shellProcess: ShellProcess = {
      exitCode: null,
      lastObservedOutputSize: 0,
      outputFiles,
      process: childProcess,
    };

    childProcess.stdout?.on('data', (data) => {
      writeOutputChunk(outputFiles, 'stdout', data);
    });

    childProcess.stderr?.on('data', (data) => {
      writeOutputChunk(outputFiles, 'stderr', data);
    });

    childProcess.on('exit', (code) => {
      logger?.debug(`${logPrefix} Process exited`, { code, shellId });
      shellProcess.exitCode = code ?? 0;
    });

    childProcess.on('error', (error) => {
      logger?.error(`${logPrefix} Command failed:`, error);
      writeOutputChunk(outputFiles, 'stderr', `${error.message}\n`);
      shellProcess.exitCode = 1;
    });

    processManager.register(shellId, shellProcess);
    logger?.info?.(`${logPrefix} Started session`, { background: run_in_background, shellId });

    if (run_in_background) {
      const output = processManager.buildRunCommandOutput(shellProcess);
      return {
        ...output,
        running: true,
        shell_id: shellId,
        success: true,
      };
    }

    const observation = await processManager.getRunCommandOutput({
      shell_id: shellId,
      timeout,
    });

    return {
      ...observation,
      shell_id: shellId,
    };
  } catch (error) {
    return { error: (error as Error).message, success: false };
  }
}

const writeOutputChunk = (
  outputFiles: ShellOutputFiles,
  _stream: 'stderr' | 'stdout',
  data: Buffer | string,
): void => {
  if (outputFiles.closed) return;
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  try {
    fs.writeSync(outputFiles.outputFd, buffer);
  } catch {
    // The process may emit buffered data after cancellation closed the output files.
  }
};
