export interface FormatCommandResultParams {
  error?: string;
  exitCode?: number;
  omittedBytes?: number;
  output?: string;
  outputFilePath?: string;
  outputFileSize?: number;
  previewKind?: 'head_tail' | 'tail';
  previewTruncated?: boolean;
  shellId?: string;
  stderr?: string;
  status?: 'completed' | 'running';
  stdout?: string;
  success: boolean;
}

export const formatCommandResult = ({
  success,
  shellId,
  error,
  output,
  outputFilePath,
  outputFileSize,
  previewKind,
  previewTruncated,
  omittedBytes,
  stdout,
  stderr,
  status,
  exitCode,
}: FormatCommandResultParams): string => {
  const parts: string[] = [];

  // `success` is the envelope ("service responded"); `exitCode` is the command
  // itself. Treat a non-zero exit as failure regardless of envelope success,
  // so we never render "Command completed successfully." over a 137/130/etc.
  const hasNonZeroExit = exitCode !== undefined && exitCode !== 0;
  const failed = !success || hasNonZeroExit;

  if (failed) {
    let header = 'Command failed';
    if (hasNonZeroExit) header += ` with exit code ${exitCode}`;
    if (error) header += `: ${error}`;
    parts.push(header);
  } else if (exitCode === undefined) {
    parts.push(`Command is still running after the wait window.\nshell_id: ${shellId}`);
  } else {
    parts.push('Command completed successfully.');
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
  } else {
    if (stdout) parts.push(`Output:\n${stdout}`);
    if (stderr) parts.push(`Stderr:\n${stderr}`);
  }

  if (status) parts.push(`Status: ${status}`);

  return parts.join('\n\n');
};
