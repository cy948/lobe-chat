import { describe, expect, it } from 'vitest';

import { formatCommandOutput } from './formatCommandOutput';

describe('formatCommandOutput', () => {
  it('should format successful output without exit code', () => {
    const result = formatCommandOutput({
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command output snapshot retrieved.

      Status: completed"
    `);
  });

  it('should suppress zero exit code when present', () => {
    const result = formatCommandOutput({
      exitCode: 0,
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command output snapshot retrieved.

      Status: completed"
    `);
  });

  it('should format duration in seconds when present', () => {
    const result = formatCommandOutput({
      durationMs: 45_400,
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "Command output snapshot retrieved.

      Duration: 45s

      Status: completed"
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

      Status: completed

      Output:
      Process output here"
    `);
  });

  it('should format failed output', () => {
    const result = formatCommandOutput({
      error: 'Process not found',
      success: false,
    });
    expect(result).toMatchInlineSnapshot(`
      "Failed: Process not found

      Status: completed"
    `);
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

      Status: completed

      Output:
      Some output

      Error: Warning message"
    `);
  });
});
