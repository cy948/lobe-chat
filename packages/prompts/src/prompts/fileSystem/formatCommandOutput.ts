export interface FormatCommandOutputParams {
  durationMs?: number;
  error?: string;
  exitCode?: number;
  output?: string;
  outputFilePath?: string;
  outputFileSize?: number;
  outputTruncated?: boolean;
  running?: boolean;
  shellId?: string;
  success: boolean;
}

const formatDuration = (durationMs: number): string => {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${seconds}s`;
};

export const formatCommandOutputFileSize = (sizeInBytes: number): string => {
  const kb = sizeInBytes / 1024;
  if (kb < 1) return `${sizeInBytes} bytes`;
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
  running,
  shellId,
  error,
}: FormatCommandOutputParams): string => {
  let message = success ? 'Command output snapshot retrieved.' : `Failed: ${error}`;
  if (running && outputFilePath) {
    message = `Command running in background with shell_id: ${shellId}. Output is being written to: ${outputFilePath}`;
  }

  const parts: string[] = [message];
  if (exitCode !== undefined && exitCode !== 0) parts.push(`Exit code: ${exitCode}`);
  if (durationMs !== undefined && Number.isFinite(durationMs)) {
    parts.push(`Duration: ${formatDuration(durationMs)}`);
  }
  if (running !== undefined) parts.push(`Status: ${running ? 'running' : 'completed'}`);
  if (outputFilePath && outputTruncated) {
    const size =
      outputFileSize === undefined ? 'unknown size' : formatCommandOutputFileSize(outputFileSize);
    parts.push(`Output too large (${size}). Full output saved to: ${outputFilePath}`);
  }
  if (output) parts.push(`${outputTruncated ? 'Preview' : 'Output'}:\n${output}`);
  if (error && success) parts.push(`Error: ${error}`);

  return parts.join('\n\n');
};
