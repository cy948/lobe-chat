import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildOutputPreview, getShellConfig } from '../utils';

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

    expect(preview.size).toBe(20);
    expect(preview.truncated).toBe(true);
    expect(preview.content).toContain('omitted 12 bytes');
    expect(preview.content).toContain('aa');
    expect(preview.content).toContain('bbbbbb');
  });

  it('should build a tail-only preview and strip ANSI from inline content', () => {
    const filePath = path.join(tmpDir, 'output.log');
    fs.writeFileSync(filePath, `prefix\n\x1B[31m${'x'.repeat(12)}\x1B[0m`);

    const preview = buildOutputPreview(filePath, { headRatio: 0, maxBytes: 16 });

    expect(preview.truncated).toBe(true);
    expect(preview.content).toContain('showing last 16');
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
