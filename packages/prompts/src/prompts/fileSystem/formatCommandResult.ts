export interface FormatCommandResultParams {
  error?: string;
  exitCode?: number;
  output?: string;
  outputFilePath?: string;
  shellId?: string;
  success: boolean;
}

export const formatCommandResult = ({
  success,
  shellId,
  error,
  output,
  outputFilePath,
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
    if (outputFilePath) parts.push(`Output is being written to: ${outputFilePath}`);
  } else {
    parts.push('Command completed successfully.');
  }

  if (output) parts.push(`Output:\n${output}`);

  return parts.join('\n\n');
};
