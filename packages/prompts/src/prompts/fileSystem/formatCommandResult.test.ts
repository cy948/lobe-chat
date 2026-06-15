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
      "Command is still running after the wait window.
      shell_id: shell-123"
    `);
  });

  it('should format still-running command with output file path', () => {
    const result = formatCommandResult({
      outputFilePath: '/tmp/lobehub-shell/output.log',
      outputFileSize: 1536,
      shellId: 'shell-123',
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command is still running after the wait window.
      shell_id: shell-123

      Full output saved to: /tmp/lobehub-shell/output.log (1.5KB)"
    `);
  });

  it('should format successful command with output', () => {
    const result = formatCommandResult({
      exitCode: 0,
      output: 'Hello World',
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command completed successfully.

      Output:
      Hello World"
    `);
  });

  it('should format command output when it contains saved file metadata', () => {
    const result = formatCommandResult({
      exitCode: 0,
      output:
        'first lines\n... [omitted 12000 bytes; full output saved to: /tmp/lobehub-shell/output.log]\nlast lines',
      success: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "Command completed successfully.

      Output:
      first lines
      ... [omitted 12000 bytes; full output saved to: /tmp/lobehub-shell/output.log]
      last lines"
    `);
  });

  it('should format command output file metadata without large-output wording when not truncated', () => {
    const result = formatCommandResult({
      exitCode: 0,
      output: 'small output',
      outputFilePath: '/tmp/lobehub-shell/output.log',
      outputFileSize: 1536,
      success: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "Command completed successfully.

      Full output saved to: /tmp/lobehub-shell/output.log (1.5KB)

      Output:
      small output"
    `);
  });

  it('should format truncated command output file metadata', () => {
    const result = formatCommandResult({
      exitCode: 0,
      output: 'preview output',
      outputFilePath: '/tmp/lobehub-shell/output.log',
      outputFileSize: 1536,
      outputTruncated: true,
      success: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "Command completed successfully.

      Output too large (1.5KB). Full output saved to: /tmp/lobehub-shell/output.log

      Output:
      preview output"
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
      output: 'partial output',
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
      output: 'Some output',
      success: false,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command failed with exit code 1: Command error

      Output:
      Some output"
    `);
  });
});
