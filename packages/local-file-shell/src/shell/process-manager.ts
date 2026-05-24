import type { ChildProcess } from 'node:child_process';

import type { GetCommandOutputParams, GetCommandOutputResult, KillCommandResult } from '../types';
import { truncateOutput } from './utils';

const MAX_OBSERVATION_TIMEOUT_MS = 30_000;
const MIN_OBSERVATION_TIMEOUT_MS = 0;
const COMPLETED_PROCESS_RETENTION_MS = 43_200_000;

interface ShellProcessManagerOptions {
  completedProcessRetentionMs?: number;
}

interface Waiter {
  resolve: () => void;
  timer?: ReturnType<typeof setTimeout>;
}

export interface ShellProcess {
  cleanupTimer?: ReturnType<typeof setTimeout>;
  exitCode: number | null;
  lastReadStderr: number;
  lastReadStdout: number;
  process: ChildProcess;
  stderr: string[];
  stdout: string[];
  waiter?: Waiter;
}

export class ShellProcessManager {
  private processes = new Map<string, ShellProcess>();
  private completedProcessRetentionMs: number;

  constructor(options: ShellProcessManagerOptions = {}) {
    this.completedProcessRetentionMs =
      options.completedProcessRetentionMs ?? COMPLETED_PROCESS_RETENTION_MS;
  }

  register(shellId: string, shellProcess: ShellProcess): void {
    this.processes.set(shellId, shellProcess);
  }

  complete(shellId: string, exitCode: number | null): void {
    const shellProcess = this.processes.get(shellId);
    if (!shellProcess) return;

    shellProcess.exitCode = exitCode ?? 0;
    shellProcess.waiter?.resolve();
    if (shellProcess.cleanupTimer) clearTimeout(shellProcess.cleanupTimer);
    shellProcess.cleanupTimer = setTimeout(() => {
      this.processes.delete(shellId);
      shellProcess.cleanupTimer = undefined;
    }, this.completedProcessRetentionMs);
  }

  async getOutput({
    filter,
    shell_id,
    timeout,
  }: GetCommandOutputParams): Promise<GetCommandOutputResult> {
    const shellProcess = this.processes.get(shell_id);
    if (!shellProcess) {
      return {
        error: `Shell ID ${shell_id} not found`,
        output: '',
        stderr: '',
        stdout: '',
        success: false,
      };
    }

    if (shellProcess.exitCode === null) {
      const waitTimeout =
        typeof timeout === 'number' && Number.isFinite(timeout)
          ? Math.min(
              Math.max(Math.trunc(timeout), MIN_OBSERVATION_TIMEOUT_MS),
              MAX_OBSERVATION_TIMEOUT_MS,
            )
          : MAX_OBSERVATION_TIMEOUT_MS;

      if (waitTimeout > 0) {
        await new Promise<void>((resolve) => {
          if (shellProcess.waiter?.timer) clearTimeout(shellProcess.waiter.timer);
          shellProcess.waiter = undefined;

          const waiter: Waiter = {
            resolve: () => {
              if (waiter.timer) clearTimeout(waiter.timer);
              if (shellProcess.waiter === waiter) shellProcess.waiter = undefined;
              resolve();
            },
          };

          waiter.timer = setTimeout(() => {
            waiter.resolve();
          }, waitTimeout);

          shellProcess.waiter = waiter;
        });
      }
    }

    const { lastReadStderr, lastReadStdout, stderr, stdout } = shellProcess;

    const newStdout = stdout.slice(lastReadStdout).join('');
    const newStderr = stderr.slice(lastReadStderr).join('');
    let output = newStdout + newStderr;

    if (filter) {
      try {
        const regex = new RegExp(filter, 'gm');
        const lines = output.split('\n');
        output = lines.filter((line) => regex.test(line)).join('\n');
      } catch {
        // Invalid filter regex, use unfiltered output
      }
    }

    shellProcess.lastReadStdout = stdout.length;
    shellProcess.lastReadStderr = stderr.length;

    const done = shellProcess.exitCode !== null;

    return {
      exit_code: done ? (shellProcess.exitCode ?? 0) : undefined,
      output: truncateOutput(output),
      stderr: truncateOutput(newStderr),
      stdout: truncateOutput(newStdout),
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
      if (shellProcess.waiter?.timer) clearTimeout(shellProcess.waiter.timer);
      if (shellProcess.cleanupTimer) clearTimeout(shellProcess.cleanupTimer);
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
      if (sp.waiter?.timer) clearTimeout(sp.waiter.timer);
      if (sp.cleanupTimer) clearTimeout(sp.cleanupTimer);
      this.processes.delete(id);
    }
  }
}
