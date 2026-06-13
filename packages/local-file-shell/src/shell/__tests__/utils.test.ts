import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildOutputPreview, getShellConfig, MAX_OUTPUT_LENGTH, truncateOutput } from '../utils';

describe('truncateOutput', () => {
  it('should return string as-is when within limit', () => {
    expect(truncateOutput('short', 100)).toBe('short');
  });

  it('should truncate long string with indicator', () => {
    const long = 'x'.repeat(200);
    const result = truncateOutput(long, 100);

    expect(result.length).toBeLessThan(200);
    expect(result).toContain('truncated');
    expect(result).toContain('more characters');
  });

  it('should preserve ANSI escape codes so the client can render colors', () => {
    const colored = '\x1B[31m' + 'x'.repeat(50) + '\x1B[0m';
    const result = truncateOutput(colored, 100);
    expect(result).toBe(colored);
    expect(result).toContain('\x1B[');
  });

  it('should reset an open SGR state before the truncation notice', () => {
    // A long colored line whose closing \x1B[0m falls beyond the cut boundary.
    const colored = '\x1B[31m' + 'x'.repeat(200) + '\x1B[0m';
    const result = truncateOutput(colored, 100);

    expect(result).toContain('truncated');
    // The reset must sit right before the notice so the color cannot bleed into it.
    expect(result).toContain('\x1B[0m\n... [truncated');
    // Everything after the reset (the notice) carries no further escape codes.
    const notice = result.slice(result.indexOf('\x1B[0m\n'));
    expect(notice.slice('\x1B[0m'.length)).not.toContain('\x1B[');
  });

  it('should drop a partial escape sequence left dangling at the cut boundary', () => {
    // maxLength lands in the middle of the second color sequence (\x1B[32 has no final byte yet).
    const input = '\x1B[31mred' + '\x1B[32mgreen';
    const cutInsideEscape = ('\x1B[31mred' + '\x1B[32').length;
    const result = truncateOutput(input, cutInsideEscape);

    // The incomplete \x1B[32 must be removed, not carried into the output.
    expect(result).not.toContain('\x1B[32');
    expect(result.startsWith('\x1B[31mred')).toBe(true);
    expect(result).toContain('\x1B[0m\n... [truncated');
  });

  it('should not inject an ANSI reset into plain (non-colored) output', () => {
    const result = truncateOutput('x'.repeat(200), 100);
    expect(result).not.toContain('\x1B');
    expect(result).toBe('x'.repeat(100) + '\n... [truncated, 100 more characters]');
  });

  it('should use MAX_OUTPUT_LENGTH as default', () => {
    const long = 'x'.repeat(MAX_OUTPUT_LENGTH + 1000);
    const result = truncateOutput(long);
    expect(result).toContain('truncated');
    expect(result.length).toBeLessThan(long.length);
  });
});

describe('buildOutputPreview', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobehub-output-preview-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { force: true, recursive: true });
  });

  it('should build a head/tail preview with the configured ratio', () => {
    const filePath = path.join(tmpDir, 'output.log');
    fs.writeFileSync(filePath, 'a'.repeat(10) + 'b'.repeat(10));

    const preview = buildOutputPreview(filePath, { headRatio: 0.25, maxBytes: 8 });

    expect(preview.kind).toBe('head_tail');
    expect(preview.size).toBe(20);
    expect(preview.truncated).toBe(true);
    expect(preview.omittedBytes).toBe(12);
    expect(preview.content).toContain('aa');
    expect(preview.content).toContain('bbbbbb');
  });

  it('should build a tail-only preview and strip ANSI from inline content', () => {
    const filePath = path.join(tmpDir, 'output.log');
    fs.writeFileSync(filePath, `prefix\n\x1B[31m${'x'.repeat(12)}\x1B[0m`);

    const preview = buildOutputPreview(filePath, { headRatio: 0, maxBytes: 16 });

    expect(preview.kind).toBe('tail');
    expect(preview.truncated).toBe(true);
    expect(preview.content).not.toContain('\x1B');
    expect(preview.content).toContain('xxxxxxxxxxxx');
  });
});

describe('getShellConfig', () => {
  it('should return shell config for current platform', () => {
    const config = getShellConfig('echo hello');

    if (process.platform === 'win32') {
      expect(config.cmd).toBe('cmd.exe');
      expect(config.args).toEqual(['/c', 'echo hello']);
    } else {
      expect(config.cmd).toBe('/bin/sh');
      expect(config.args).toEqual(['-c', 'echo hello']);
    }
  });
});
