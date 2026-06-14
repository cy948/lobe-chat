import { describe, expect, it } from 'vitest';

import { formatCommandOutput } from './formatCommandOutput';

describe('formatCommandOutput', () => {
  it('should format successful output without exit code', () => {
    const result = formatCommandOutput({
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`"Command output snapshot retrieved."`);
  });

  it('should suppress zero exit code when present', () => {
    const result = formatCommandOutput({
      exitCode: 0,
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`"Command output snapshot retrieved."`);
  });

  it('should format duration in seconds when present', () => {
    const result = formatCommandOutput({
      durationMs: 45_400,
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command output snapshot retrieved.

      Duration: 45s"
    `);
  });

  it('should format completed output with non-zero exit code', () => {
    const result = formatCommandOutput({
      durationMs: 123_000,
      exitCode: 17,
      output: 'Process output here',
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command output snapshot retrieved.

      Exit code: 17

      Duration: 123s

      Output:
      Process output here"
    `);
  });

  it('should format failed output', () => {
    const result = formatCommandOutput({
      error: 'Process not found',
      success: false,
    });
    expect(result).toMatchInlineSnapshot(`"Failed: Process not found"`);
  });

  it('should format successful output with error info', () => {
    const result = formatCommandOutput({
      error: 'Warning message',
      exitCode: 1,
      output: 'Some output',
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command output snapshot retrieved.

      Exit code: 1

      Output:
      Some output

      Error: Warning message"
    `);
  });

  it('should format truncated output with saved file metadata and preview', () => {
    const result = formatCommandOutput({
      output: 'head\n...\ntail',
      outputFilePath: '/tmp/lobehub-shell/output.log',
      outputFileSize: 20_000,
      outputTruncated: true,
      success: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "Command output snapshot retrieved.

      Output too large (19.5KB). Full output saved to: /tmp/lobehub-shell/output.log

      Preview:
      head
      ...
      tail"
    `);
  });

  it('should keep small saved output as normal output', () => {
    const result = formatCommandOutput({
      output: 'small output',
      outputFilePath: '/tmp/lobehub-shell/output.log',
      outputFileSize: 12,
      outputTruncated: false,
      success: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "Command output snapshot retrieved.

      Output:
      small output"
    `);
  });

  it('should format output file size with Claude Code-style units', () => {
    const result = formatCommandOutput({
      output: 'preview',
      outputFilePath: '/tmp/lobehub-shell/output.log',
      outputFileSize: 280_148,
      outputTruncated: true,
      success: true,
    });

    expect(result).toContain('Output too large (273.6KB).');
  });
});
