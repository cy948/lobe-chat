import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import treeKill from 'tree-kill';

import type { GetCommandOutputParams, GetCommandOutputResult, KillCommandResult } from '../types';
import { buildOutputPreview } from './utils';

const DEFAULT_OBSERVATION_TIMEOUT_MS = 30_000;
const MAX_OBSERVATION_TIMEOUT_MS = 120_000;
const RUN_COMMAND_HEAD_RATIO = 0.25;
const GET_COMMAND_OUTPUT_HEAD_RATIO = 0;
const KILL_SIGNAL: NodeJS.Signals = 'SIGKILL';

export interface ShellOutputFile {
  fd: number;
  /** Tracks the parent fd only; child stdio close is tracked by ShellProcess.closedAt. */
  fdClosed?: boolean;
  path: string;
}

export interface ShellProcess {
  closed?: Promise<void>;
  closedAt?: number;
  endedAt?: number;
  exitCode: number | null;
  outputFile: ShellOutputFile;
  process: ChildProcess;
  startedAt?: number;
}

export class ShellProcessManager {
  private nextShellId = 1;

  private readonly outputRunDir: string;

  private processes = new Map<string, ShellProcess>();

  constructor(outputRoot?: string) {
    this.outputRunDir = path.join(
      path.resolve(outputRoot ?? path.join(os.tmpdir(), 'lobehub', 'shell')),
      formatDate(new Date()),
      process.pid.toString(),
    );
    fs.mkdirSync(this.outputRunDir, { mode: 0o700, recursive: true });
  }

  createShellId(): string {
    return `sh-${this.nextShellId++}`;
  }

  createOutputFile(shellId: string): ShellOutputFile {
    const outputPath = path.join(this.outputRunDir, `${shellId}.log`);

    return {
      fd: this.openOutputFile(outputPath),
      path: outputPath,
    };
  }

  register(shellId: string, shellProcess: ShellProcess): void {
    shellProcess.startedAt ??= Date.now();
    if (shellProcess.exitCode !== null || shellProcess.process.exitCode !== null) {
      shellProcess.endedAt ??= Date.now();
    }

    const markEnded = () => {
      shellProcess.endedAt ??= Date.now();
    };

    shellProcess.process.once('exit', markEnded);
    shellProcess.process.once('error', markEnded);
    shellProcess.closed = this.createClosedPromise(shellProcess);
    this.processes.set(shellId, shellProcess);
  }

  async getRunCommandOutput(params: GetCommandOutputParams): Promise<GetCommandOutputResult> {
    return this.observeOutput(params, RUN_COMMAND_HEAD_RATIO);
  }

  async getOutput(params: GetCommandOutputParams): Promise<GetCommandOutputResult> {
    return this.observeOutput(params, GET_COMMAND_OUTPUT_HEAD_RATIO);
  }

  private async observeOutput(
    { filter, shell_id, timeout }: GetCommandOutputParams,
    headRatio: number,
  ): Promise<GetCommandOutputResult> {
    const shellProcess = this.processes.get(shell_id);
    if (!shellProcess) {
      return {
        error: `Shell ID ${shell_id} not found`,
        output: '',
        output_file_size: 0,
        success: false,
      };
    }

    const { process: childProcess } = shellProcess;

    let exitCode = childProcess.exitCode ?? shellProcess.exitCode;
    if (exitCode === null) {
      const waitTimeout =
        typeof timeout === 'number' && Number.isFinite(timeout)
          ? Math.min(Math.max(Math.trunc(timeout), 0), MAX_OBSERVATION_TIMEOUT_MS)
          : DEFAULT_OBSERVATION_TIMEOUT_MS;

      if (waitTimeout > 0) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let onError: (() => void) | undefined;
        let onExit: (() => void) | undefined;

        try {
          await Promise.race([
            new Promise<void>((resolve) => {
              onError = resolve;
              childProcess.once('error', onError);
            }),
            new Promise<void>((resolve) => {
              onExit = resolve;
              childProcess.once('exit', onExit);
            }),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, waitTimeout);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
          if (onError) childProcess.off('error', onError);
          if (onExit) childProcess.off('exit', onExit);
        }
      }
    }

    exitCode = childProcess.exitCode ?? shellProcess.exitCode;
    if (exitCode !== null) {
      shellProcess.endedAt ??= Date.now();
      await shellProcess.closed;
    }

    const { outputFile } = shellProcess;
    const outputPreview = buildOutputPreview(outputFile.path, { headRatio });
    let output = outputPreview.content;

    if (filter) {
      try {
        const regex = new RegExp(filter, 'm');
        const lines = output.split('\n');
        output = lines.filter((line) => regex.test(line)).join('\n');
      } catch {
        // Invalid filter regex, use unfiltered output
      }
    }

    const startedAt = shellProcess.startedAt ?? Date.now();
    const durationMs = Math.max(0, (shellProcess.endedAt ?? Date.now()) - startedAt);

    return {
      duration_ms: durationMs,
      exit_code: exitCode ?? undefined,
      output,
      output_file_path: outputFile.path,
      output_file_size: outputPreview.size,
      output_truncated: outputPreview.truncated,
      success: true,
    };
  }

  kill(shell_id: string): KillCommandResult {
    const shellProcess = this.processes.get(shell_id);
    if (!shellProcess) {
      return { error: `Shell ID ${shell_id} not found`, success: false };
    }

    try {
      killProcessTree(shellProcess.process);
      this.closeOutputFile(shellProcess.outputFile);
      this.processes.delete(shell_id);
      return { success: true };
    } catch (error) {
      return { error: (error as Error).message, success: false };
    }
  }

  cleanupAll(): void {
    for (const [id, sp] of this.processes) {
      try {
        killProcessTree(sp.process);
      } catch {
        // Ignore
      }
      this.closeOutputFile(sp.outputFile);
      this.processes.delete(id);
    }
  }

  closeOutputFile(outputFile: ShellOutputFile): void {
    if (outputFile.fdClosed) return;
    outputFile.fdClosed = true;
    try {
      fs.closeSync(outputFile.fd);
    } catch {
      // Ignore repeated close attempts.
    }
  }

  private createClosedPromise(shellProcess: ShellProcess): Promise<void> {
    if (shellProcess.closedAt !== undefined) return Promise.resolve();

    return new Promise<void>((resolve) => {
      shellProcess.process.once('close', () => {
        shellProcess.closedAt ??= Date.now();
        shellProcess.endedAt ??= shellProcess.closedAt;
        this.closeOutputFile(shellProcess.outputFile);
        resolve();
      });
    });
  }

  private openOutputFile(filePath: string): number {
    if (process.platform === 'win32') return fs.openSync(filePath, 'w', 0o600);

    const noFollow = fs.constants.O_NOFOLLOW ?? 0;
    return fs.openSync(
      filePath,
      fs.constants.O_APPEND |
        fs.constants.O_CREAT |
        fs.constants.O_TRUNC |
        fs.constants.O_WRONLY |
        noFollow,
      0o600,
    );
  }
}

const pad2 = (value: number): string => value.toString().padStart(2, '0');

const formatDate = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const killProcessTree = (childProcess: ChildProcess): void => {
  const { pid } = childProcess;

  if (pid) {
    treeKill(pid, KILL_SIGNAL);
    return;
  }

  childProcess.kill(KILL_SIGNAL);
};
