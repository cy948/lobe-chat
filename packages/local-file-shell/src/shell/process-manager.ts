import type { ChildProcess } from 'node:child_process';

import type { GetCommandOutputParams, GetCommandOutputResult, KillCommandResult } from '../types';
import { truncateOutput } from './utils';

export interface ShellProcess {
  exitCode: number | null;
  lastReadStderr: number;
  lastReadStdout: number;
  process: ChildProcess;
  stderr: string[];
  stdout: string[];
}

export class ShellProcessManager {
  private processes = new Map<string, ShellProcess>();

  register(shellId: string, shellProcess: ShellProcess): void {
    this.processes.set(shellId, shellProcess);
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

    const { lastReadStderr, lastReadStdout, process: childProcess, stderr, stdout } = shellProcess;

    let exitCode = childProcess.exitCode ?? shellProcess.exitCode;
    if (exitCode === null) {
      const waitTimeout =
        typeof timeout === 'number' && Number.isFinite(timeout)
          ? Math.min(Math.max(Math.trunc(timeout), 0), 30_000)
          : 30_000;

      if (waitTimeout > 0) {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            shellProcess.process.off('error', done);
            shellProcess.process.off('exit', done);
            resolve();
          };

          const timer = setTimeout(done, waitTimeout);
          shellProcess.process.once('error', done);
          shellProcess.process.once('exit', done);
        });
      }
    }

    exitCode = childProcess.exitCode ?? shellProcess.exitCode;

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

    return {
      exit_code: exitCode ?? undefined,
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
      this.processes.delete(id);
    }
  }
}
