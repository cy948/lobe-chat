export interface FormatCommandOutputParams {
  durationMs?: number;
  error?: string;
  exitCode?: number;
  omittedBytes?: number;
  output?: string;
  outputFilePath?: string;
  outputFileSize?: number;
  previewKind?: 'head_tail' | 'tail';
  previewTruncated?: boolean;
  running?: boolean;
  sizeDeltaSinceLastCheck?: number;
  status?: 'completed' | 'running';
  success: boolean;
}

const formatDuration = (durationMs: number): string => {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${seconds}s`;
};

export const formatCommandOutput = ({
  durationMs,
  success,
  exitCode,
  output,
  outputFilePath,
  outputFileSize,
  previewKind,
  previewTruncated,
  omittedBytes,
  running,
  sizeDeltaSinceLastCheck,
  status,
  error,
}: FormatCommandOutputParams): string => {
  const message = success ? 'Command output snapshot retrieved.' : `Failed: ${error}`;

  const parts: string[] = [message];
  if (exitCode !== undefined && exitCode !== 0) parts.push(`Exit code: ${exitCode}`);
  if (durationMs !== undefined && Number.isFinite(durationMs)) {
    parts.push(`Duration: ${formatDuration(durationMs)}`);
  }
  parts.push(`Status: ${status ?? (running ? 'running' : 'completed')}`);
  if (sizeDeltaSinceLastCheck !== undefined) {
    parts.push(`New bytes since last check: ${sizeDeltaSinceLastCheck}`);
  }
  if (outputFilePath) {
    const size = outputFileSize === undefined ? 'unknown size' : `${outputFileSize} bytes`;
    parts.push(`Output file: ${outputFilePath} (${size})`);
  }
  if (output) {
    const label = previewTruncated
      ? `Output preview (${previewKind === 'tail' ? 'tail' : 'head/tail'}, omitted ${omittedBytes ?? 0} bytes)`
      : 'Output';
    parts.push(`${label}:\n${output}`);
  }
  if (error && success) parts.push(`Error: ${error}`);

  return parts.join('\n\n');
};
