import { spawn } from 'node:child_process';

import type { GrepContentParams, GrepContentResult } from '../types';
import { expandTilde } from './expandTilde';
import { hasHiddenSegment } from './hasHiddenSegment';

const GREP_TIMEOUT_MS = 30_000;

/**
 * Lightweight grep — spawns `rg` directly and returns the raw `--json`
 * events. For the platform-aware fallback chain (rg → ag → grep → nodejs)
 * with rich `output_mode` / `-A/-B/-C` support, use
 * `createContentSearchImpl()` from `@lobechat/local-file-shell/contentSearch`.
 */
export async function grepContent({
  pattern,
  cwd,
  filePattern,
}: GrepContentParams): Promise<GrepContentResult> {
  const wantsHidden = hasHiddenSegment(filePattern);
  const hint = wantsHidden
    ? `Auto-enabled hidden-file matching because filePattern contains a dot-prefixed segment.`
    : undefined;

  return new Promise<GrepContentResult>((resolve) => {
    let settled = false;
    const args = ['--json', '-n'];
    if (wantsHidden) {
      args.push('--hidden', '--glob', '!**/.git/**');
    }
    if (filePattern) args.push('--glob', filePattern);
    args.push(pattern, '.');

    const child = spawn('rg', args, {
      cwd: expandTilde(cwd) || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', () => {
      // stderr consumed but not used
    });

    const finish = (result: GrepContentResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({
        engine: 'rg',
        error: `Search timed out after ${GREP_TIMEOUT_MS}ms`,
        hint,
        matches: [],
        success: false,
        total_matches: 0,
      });
    }, GREP_TIMEOUT_MS);

    child.on('close', (code) => {
      if (code !== 0 && code !== 1) {
        finish({ engine: 'rg', hint, matches: [], success: false, total_matches: 0 });
        return;
      }

      try {
        const matches = stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter((entry) => entry?.type === 'match')
          .filter(Boolean);

        finish({
          engine: 'rg',
          hint,
          matches,
          success: true,
          total_matches: matches.length,
        });
      } catch {
        finish({ engine: 'rg', hint, matches: [], success: true, total_matches: 0 });
      }
    });

    child.on('error', () => {
      finish({ engine: 'rg', hint, matches: [], success: false, total_matches: 0 });
    });
  });
}
