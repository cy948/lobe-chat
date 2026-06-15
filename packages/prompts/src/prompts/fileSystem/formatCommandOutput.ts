export interface FormatCommandOutputParams {
  durationMs?: number;
  error?: string;
  exitCode?: number;
  output?: string;
  outputFilePath?: string;
  outputFileSize?: number;
  outputTruncated?: boolean;
  success: boolean;
}

const formatDuration = (durationMs: number): string => {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${seconds}s`;
};

export const formatCommandOutputFileSize = (size?: number): string => {
  if (typeof size !== 'number' || !Number.isFinite(size)) return 'unknown size';
  const kb = size / 1024;
  if (kb < 1) return `${size} bytes`;
  if (kb < 1024) return `${kb.toFixed(1).replace(/\.0$/, '')}KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1).replace(/\.0$/, '')}MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1).replace(/\.0$/, '')}GB`;
};

export const formatCommandOutput = ({
  durationMs,
  success,
  exitCode,
  output,
  outputFilePath,
  outputFileSize,
  outputTruncated,
  error,
}: FormatCommandOutputParams): string => {
  const message = success ? 'Output retrieved.' : `Failed: ${error}`;

  const parts: string[] = [message];
  if (exitCode !== undefined && exitCode !== 0) parts.push(`Exit code: ${exitCode}`);
  if (durationMs !== undefined && Number.isFinite(durationMs)) {
    parts.push(`Duration: ${formatDuration(durationMs)}`);
  }
  if (outputFilePath) {
    const size = formatCommandOutputFileSize(outputFileSize);
    parts.push(
      outputTruncated
        ? `Output too large (${size}). Full output saved to: ${outputFilePath}`
        : `Full output saved to: ${outputFilePath} (${size})`,
    );
  }
  if (output) parts.push(`Output:\n${output}`);
  if (error && success) parts.push(`Error: ${error}`);

  return parts.join('\n\n');
};
