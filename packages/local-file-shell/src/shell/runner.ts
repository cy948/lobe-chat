import { spawn } from 'node:child_process';
import fs from 'node:fs';

import type { RunCommandParams, RunCommandResult } from '../types';
import type { ShellOutputFile, ShellProcess, ShellProcessManager } from './process-manager';
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
  let outputFile: ShellOutputFile | undefined;

  try {
    const shellId = processManager.createShellId();
    const shellOutputFile = processManager.createOutputFile(shellId);
    outputFile = shellOutputFile;
    const childProcess = spawn(shellConfig.cmd, shellConfig.args, {
      cwd,
      detached: process.platform !== 'win32',
      env: childEnv,
      shell: false,
      stdio: ['pipe', shellOutputFile.fd, shellOutputFile.fd],
    });

    const shellProcess: ShellProcess = {
      exitCode: null,
      outputFile: shellOutputFile,
      process: childProcess,
    };

    childProcess.on('exit', (code) => {
      logger?.debug(`${logPrefix} Process exited`, { code, shellId });
      shellProcess.exitCode = code ?? 0;
    });

    childProcess.on('error', (error) => {
      logger?.error(`${logPrefix} Command failed:`, error);
      appendOutputFile(shellOutputFile.path, `${error.message}\n`);
      shellProcess.exitCode = 1;
    });

    processManager.register(shellId, shellProcess);
    processManager.closeOutputFile(shellOutputFile);
    logger?.info?.(`${logPrefix} Started session`, { background: run_in_background, shellId });

    if (run_in_background) {
      return {
        output_file_path: shellOutputFile.path,
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
    if (outputFile) processManager.closeOutputFile(outputFile);
    return { error: (error as Error).message, success: false };
  }
}

const appendOutputFile = (filePath: string, data: string): void => {
  try {
    fs.appendFileSync(filePath, data, { mode: 0o600 });
  } catch {
    // The process may fail before or during output file setup.
  }
};
