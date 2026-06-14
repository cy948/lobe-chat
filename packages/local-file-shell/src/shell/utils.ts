import fs from 'node:fs';

/** Maximum preview bytes returned inline to prevent context explosion */
export const INLINE_OUTPUT_MAX_BYTES = 8 * 1024;

/** @deprecated Use INLINE_OUTPUT_MAX_BYTES for shell output previews. */
export const MAX_OUTPUT_LENGTH = 80_000;

export interface OutputPreview {
  content: string;
  size: number;
  truncated: boolean;
}

/** ANSI SGR reset, closes any open color/style state */
const ANSI_RESET = '\u001B[0m';

/** Matches a complete ANSI escape sequence anchored at the start of the string */
// eslint-disable-next-line no-control-regex, regexp/no-obscure-range
const ANSI_ESCAPE_AT_START = /^\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/;
// eslint-disable-next-line no-control-regex, regexp/no-obscure-range
const ANSI_ESCAPE = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/**
 * Truncate string to max length with indicator.
 *
 * ANSI escape codes are preserved so the client can render colored output, but a
 * naive slice can (a) cut across an escape sequence and (b) stop while a color or
 * style is still open. Either would bleed styling into the truncation notice and
 * anything the client renders afterwards. So we drop a dangling partial sequence
 * at the cut boundary and append a reset before the notice.
 */
export const truncateOutput = (str: string, maxLength: number = MAX_OUTPUT_LENGTH): string => {
  if (str.length <= maxLength) return str;

  let slice = str.slice(0, maxLength);

  // Drop a partial escape sequence left dangling at the cut boundary, otherwise
  // it would consume the leading characters of the truncation notice.
  const lastEsc = slice.lastIndexOf('\u001B');
  if (lastEsc !== -1 && !ANSI_ESCAPE_AT_START.test(slice.slice(lastEsc))) {
    slice = slice.slice(0, lastEsc);
  }

  // Reset any still-open SGR state so it cannot leak into the notice.
  const reset = slice.includes('\u001B') ? ANSI_RESET : '';

  return slice + reset + '\n... [truncated, ' + (str.length - maxLength) + ' more characters]';
};

const stripAnsi = (str: string): string => str.replaceAll(ANSI_ESCAPE, '');

export const buildOutputPreview = (
  filePath: string,
  {
    headRatio,
    maxBytes = INLINE_OUTPUT_MAX_BYTES,
  }: {
    headRatio: number;
    maxBytes?: number;
  },
): OutputPreview => {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { content: '', size: 0, truncated: false };
  }

  const size = stat.size;
  if (size <= 0 || maxBytes <= 0) {
    return { content: '', size, truncated: false };
  }

  const fd = fs.openSync(filePath, 'r');
  try {
    if (size <= maxBytes) {
      const buffer = Buffer.alloc(size);
      fs.readSync(fd, buffer, 0, size, 0);
      return {
        content: stripAnsi(buffer.toString('utf8')),
        size,
        truncated: false,
      };
    }

    const normalizedHeadRatio = Math.min(Math.max(headRatio, 0), 1);
    const headBytes = Math.floor(maxBytes * normalizedHeadRatio);
    const tailBytes = Math.max(0, maxBytes - headBytes);
    const omittedBytes = Math.max(0, size - headBytes - tailBytes);

    if (headBytes <= 0) {
      const tail = Buffer.alloc(Math.min(maxBytes, size));
      fs.readSync(fd, tail, 0, tail.length, Math.max(0, size - tail.length));
      return {
        content: `... [showing last ${tail.length} of ${size} bytes; full output saved to: ${filePath}]\n${stripAnsi(tail.toString('utf8'))}`,
        size,
        truncated: true,
      };
    }

    const head = Buffer.alloc(headBytes);
    const tail = Buffer.alloc(tailBytes);
    fs.readSync(fd, head, 0, headBytes, 0);
    fs.readSync(fd, tail, 0, tailBytes, Math.max(0, size - tailBytes));

    return {
      content: `${stripAnsi(head.toString('utf8'))}\n... [omitted ${omittedBytes} bytes; full output saved to: ${filePath}]\n${stripAnsi(tail.toString('utf8'))}`,
      size,
      truncated: true,
    };
  } finally {
    fs.closeSync(fd);
  }
};

/** Get cross-platform shell configuration */
export const getShellConfig = (command: string) =>
  process.platform === 'win32'
    ? { args: ['/c', command], cmd: 'cmd.exe' }
    : { args: ['-c', command], cmd: '/bin/sh' };
