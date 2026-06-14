import { describe, expect, it } from 'vitest';

import { formatCommandResult } from './formatCommandResult';

describe('formatCommandResult', () => {
  it('should format successful command without output', () => {
    const result = formatCommandResult({ exitCode: 0, success: true });
    expect(result).toMatchInlineSnapshot(`"Command completed successfully."`);
  });

  it('should format still-running command', () => {
    const result = formatCommandResult({
      shellId: 'shell-123',
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command running in background with shell_id: shell-123"
    `);
  });

  it('should format successful command with stdout', () => {
    const result = formatCommandResult({
      exitCode: 0,
      stdout: 'Hello World',
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command completed successfully.

      Output:
      Hello World"
    `);
  });

  it('should format command output file metadata and preview', () => {
    const result = formatCommandResult({
      exitCode: 0,
      output: 'first lines\n...\nlast lines',
      outputFilePath: '/tmp/lobehub-shell/output.log',
      outputFileSize: 20_000,
      outputTruncated: true,
      success: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "Command completed successfully.

      Output too large (19.5KB). Full output saved to: /tmp/lobehub-shell/output.log

      Preview:
      first lines
      ...
      last lines"
    `);
  });

  it('should format command output file metadata without large-output wording when not truncated', () => {
    const result = formatCommandResult({
      exitCode: 0,
      output: 'small output',
      outputFilePath: '/tmp/lobehub-shell/output.log',
      outputFileSize: 12,
      outputTruncated: false,
      success: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "Command completed successfully.

      Output:
      small output"
    `);
  });

  it('should prefer combined output over separate stdout and stderr', () => {
    const result = formatCommandResult({
      output: 'combined stream',
      shellId: 'shell-123',
      stderr: 'stderr stream',
      stdout: 'stdout stream',
      success: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "Command running in background with shell_id: shell-123

      Output:
      combined stream"
    `);
  });

  it('should format successful command with stderr', () => {
    const result = formatCommandResult({
      exitCode: 0,
      stderr: 'Warning: deprecated',
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command completed successfully.

      Stderr:
      Warning: deprecated"
    `);
  });

  it('should suppress the Exit code line when exitCode is 0', () => {
    const result = formatCommandResult({
      exitCode: 0,
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`"Command completed successfully."`);
  });

  it('should treat shell id with exitCode 0 as completed', () => {
    const result = formatCommandResult({
      exitCode: 0,
      shellId: 'shell-123',
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`"Command completed successfully."`);
  });

  it('should treat a non-zero exit code as failure even when envelope success is true', () => {
    const result = formatCommandResult({
      exitCode: 137,
      stdout: 'partial output',
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command failed with exit code 137

      Output:
      partial output"
    `);
  });

  it('should format failed command', () => {
    const result = formatCommandResult({
      error: 'Permission denied',
      success: false,
    });
    expect(result).toMatchInlineSnapshot(`"Command failed: Permission denied"`);
  });

  it('should format command with all fields', () => {
    const result = formatCommandResult({
      error: 'Command error',
      exitCode: 1,
      stderr: 'Error occurred',
      stdout: 'Some output',
      success: false,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command failed with exit code 1: Command error

      Output:
      Some output

      Stderr:
      Error occurred"
    `);
  });
});
