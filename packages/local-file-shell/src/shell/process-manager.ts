import type { ChildProcess } from 'node:child_process';

import type { GetCommandOutputParams, GetCommandOutputResult, KillCommandResult } from '../types';
import { truncateOutput } from './utils';

const MAX_OBSERVATION_TIMEOUT_MS = 30_000;
const MIN_OBSERVATION_TIMEOUT_MS = 0;

interface Waiter {
  filter?: string;
  resolve: (result: GetCommandOutputResult) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export interface ShellProcess {
  exitCode: number | null;
  process: ChildProcess;
  stderr: string[];
  stdout: string[];
  waiter?: Waiter;
}

const clampObservationTimeout = (timeout?: number): number => {
  if (typeof timeout !== 'number' || !Number.isFinite(timeout)) return MAX_OBSERVATION_TIMEOUT_MS;

  return Math.min(
    Math.max(Math.trunc(timeout), MIN_OBSERVATION_TIMEOUT_MS),
    MAX_OBSERVATION_TIMEOUT_MS,
  );
};

export class ShellProcessManager {
  private processes = new Map<string, ShellProcess>();

  register(shellId: string, shellProcess: ShellProcess): void {
    this.processes.set(shellId, shellProcess);
  }

  complete(shellId: string, exitCode: number | null): void {
    const shellProcess = this.processes.get(shellId);
    if (!shellProcess) return;

    shellProcess.exitCode = exitCode ?? 0;
    this.flushWaiter(shellProcess);
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

    if (shellProcess.exitCode !== null) {
      return this.readOutput(shellProcess, filter);
    }

    const waitTimeout = clampObservationTimeout(timeout);
    if (waitTimeout === 0) {
      return this.readOutput(shellProcess, filter);
    }

    return new Promise<GetCommandOutputResult>((resolve) => {
      this.clearWaiter(shellProcess);

      const waiter: Waiter = {
        filter,
        resolve: (result) => {
          this.clearWaiter(shellProcess);
          resolve(result);
        },
      };

      waiter.timer = setTimeout(() => {
        waiter.resolve(this.readOutput(shellProcess, filter));
      }, waitTimeout);

      shellProcess.waiter = waiter;
    });
  }

  kill(shell_id: string): KillCommandResult {
    const shellProcess = this.processes.get(shell_id);
    if (!shellProcess) {
      return { error: `Shell ID ${shell_id} not found`, success: false };
    }

    try {
      shellProcess.process.kill();
      this.clearWaiter(shellProcess);
      this.processes.delete(shell_id);
      return { success: true };
    } catch (error) {
      return { error: (error as Error).message, success: false };
    }
  }

  cleanupAll(): void {
    for (const [id, shellProcess] of this.processes) {
      try {
        shellProcess.process.kill();
      } catch {
        // Ignore
      }

      this.clearWaiter(shellProcess);
      this.processes.delete(id);
    }
  }

  private clearWaiter(shellProcess: ShellProcess): void {
    if (!shellProcess.waiter) return;
    if (shellProcess.waiter.timer) {
      clearTimeout(shellProcess.waiter.timer);
    }
    shellProcess.waiter = undefined;
  }

  private flushWaiter(shellProcess: ShellProcess, filter?: string): void {
    const waiter = shellProcess.waiter;
    if (!waiter) return;

    waiter.resolve(this.readOutput(shellProcess, filter ?? waiter.filter));
  }

  private readOutput(shellProcess: ShellProcess, filter?: string): GetCommandOutputResult {
    const stdout = shellProcess.stdout.join('');
    const stderr = shellProcess.stderr.join('');
    let output = stdout + stderr;

    if (filter) {
      try {
        const regex = new RegExp(filter, 'gm');
        output = output
          .split('\n')
          .filter((line) => regex.test(line))
          .join('\n');
      } catch {
        // Invalid filter regex, use unfiltered output
      }
    }

    const done = shellProcess.exitCode !== null;

    return {
      exit_code: done ? (shellProcess.exitCode ?? 0) : undefined,
      output: truncateOutput(output),
      stderr: truncateOutput(stderr),
      stdout: truncateOutput(stdout),
      success: true,
    };
  }
}
