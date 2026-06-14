import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { GetCommandOutputParams, GetCommandOutputResult, KillCommandResult } from '../types';
import { buildOutputPreview } from './utils';

const DEFAULT_OBSERVATION_TIMEOUT_MS = 30_000;
const MAX_OBSERVATION_TIMEOUT_MS = 120_000;
const RUN_COMMAND_HEAD_RATIO = 0.25;
const GET_COMMAND_OUTPUT_HEAD_RATIO = 0;

export interface ShellOutputFiles {
  closed?: boolean;
  outputFd: number;
  outputPath: string;
}

export interface ShellProcess {
  closedAt?: number;
  endedAt?: number;
  exitCode: number | null;
  lastObservedOutputSize: number;
  outputFiles: ShellOutputFiles;
  process: ChildProcess;
  startedAt?: number;
}

export interface ShellProcessManagerOptions {
  now?: () => Date;
  outputRoot?: string;
}

export class ShellProcessManager {
  private nextShellId = 1;

  private outputRunDir?: string;

  private processes = new Map<string, ShellProcess>();

  constructor(private readonly options: ShellProcessManagerOptions = {}) {}

  createShellId(): string {
    return `sh-${this.nextShellId++}`;
  }

  createOutputFiles(shellId: string): ShellOutputFiles {
    const shellDir = path.join(this.ensureOutputRunDir(), shellId);
    fs.mkdirSync(shellDir, { mode: 0o700, recursive: false });

    const outputPath = path.join(shellDir, 'output.log');

    return {
      outputFd: this.openOutputFile(outputPath),
      outputPath,
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
    shellProcess.process.once('close', () => {
      shellProcess.closedAt ??= Date.now();
      shellProcess.endedAt ??= shellProcess.closedAt;
      this.closeOutputFiles(shellProcess.outputFiles);
    });
    this.processes.set(shellId, shellProcess);
  }

  buildRunCommandOutput(
    shellProcess: ShellProcess,
  ): Omit<GetCommandOutputResult, 'duration_ms' | 'exit_code' | 'success'> {
    return this.buildOutputResult(shellProcess, RUN_COMMAND_HEAD_RATIO);
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
        stderr: '',
        stdout: '',
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
      await this.waitForClose(shellProcess);
    }

    const previousSize = shellProcess.lastObservedOutputSize;
    const result = this.buildOutputResult(shellProcess, headRatio);
    let { output } = result;

    if (filter) {
      try {
        const regex = new RegExp(filter, 'm');
        const lines = output.split('\n');
        output = lines.filter((line) => regex.test(line)).join('\n');
      } catch {
        // Invalid filter regex, use unfiltered output
      }
    }

    const sizeDelta = Math.max(0, result.output_file_size - previousSize);
    shellProcess.lastObservedOutputSize = result.output_file_size;
    const startedAt = shellProcess.startedAt ?? Date.now();
    const durationMs = Math.max(0, (shellProcess.endedAt ?? Date.now()) - startedAt);

    return {
      duration_ms: durationMs,
      exit_code: exitCode ?? undefined,
      output,
      output_file_path: result.output_file_path,
      output_file_size: result.output_file_size,
      output_truncated: result.output_truncated,
      running: exitCode === null,
      size_delta_since_last_check: sizeDelta,
      stderr: result.stderr,
      stdout: result.stdout,
      success: true,
    };
  }

  kill(shell_id: string): KillCommandResult {
    const shellProcess = this.processes.get(shell_id);
    if (!shellProcess) {
      return { error: `Shell ID ${shell_id} not found`, success: false };
    }

    try {
      shellProcess.process.kill();
      this.closeOutputFiles(shellProcess.outputFiles);
      this.processes.delete(shell_id);
      return { success: true };
    } catch (error) {
      return { error: (error as Error).message, success: false };
    }
  }

  cleanupAll(): void {
    for (const [id, sp] of this.processes) {
      try {
        sp.process.kill();
      } catch {
        // Ignore
      }
      this.closeOutputFiles(sp.outputFiles);
      this.processes.delete(id);
    }
  }

  private buildOutputResult(shellProcess: ShellProcess, headRatio: number) {
    const { outputFiles } = shellProcess;
    const combined = buildOutputPreview(outputFiles.outputPath, { headRatio });

    return {
      output: combined.content,
      output_file_path: outputFiles.outputPath,
      output_file_size: combined.size,
      output_truncated: combined.truncated,
      stderr: '',
      stdout: combined.content,
    };
  }

  private closeOutputFiles(outputFiles: ShellOutputFiles): void {
    if (outputFiles.closed) return;
    outputFiles.closed = true;
    try {
      fs.closeSync(outputFiles.outputFd);
    } catch {
      // Ignore repeated close attempts.
    }
  }

  private async waitForClose(shellProcess: ShellProcess): Promise<void> {
    if (shellProcess.closedAt !== undefined || shellProcess.outputFiles.closed) return;

    await new Promise<void>((resolve) => {
      shellProcess.process.once('close', resolve);
    });
  }

  private ensureOutputRunDir(): string {
    if (this.outputRunDir) return this.outputRunDir;

    const now = this.options.now?.() ?? new Date();
    const root = path.resolve(
      this.options.outputRoot ?? path.join(os.tmpdir(), 'lobehub', 'shell-outputs'),
    );
    const dateDir = path.join(root, formatDate(now));
    fs.mkdirSync(dateDir, { mode: 0o700, recursive: true });

    const baseName = formatTime(now);
    for (let i = 1; i <= 100; i++) {
      const dirName = i === 1 ? baseName : `${baseName}-${i}`;
      const runDir = path.join(dateDir, dirName);
      try {
        fs.mkdirSync(runDir, { mode: 0o700, recursive: false });
        this.outputRunDir = runDir;
        return runDir;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }

    throw new Error(`Unable to create shell output directory under ${dateDir}`);
  }

  private openOutputFile(filePath: string): number {
    const noFollow = fs.constants.O_NOFOLLOW ?? 0;
    return fs.openSync(
      filePath,
      fs.constants.O_CREAT | fs.constants.O_WRONLY | fs.constants.O_TRUNC | noFollow,
      0o600,
    );
  }
}

const pad2 = (value: number): string => value.toString().padStart(2, '0');

const formatDate = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const formatTime = (date: Date): string =>
  `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
