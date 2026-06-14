export interface FormatCommandResultParams {
  error?: string;
  exitCode?: number;
  output?: string;
  outputFilePath?: string;
  outputFileSize?: number;
  outputTruncated?: boolean;
  shellId?: string;
  stderr?: string;
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
  outputTruncated,
  stdout,
  stderr,
  exitCode,
}: FormatCommandResultParams): string => {
  const parts: string[] = [];

  // `success` is the envelope ("service responded"); `exitCode` is the command
  // itself. Treat a non-zero exit as failure regardless of envelope success,
  // so we never render "Command completed successfully." over a 137/130/etc.
  const hasNonZeroExit = exitCode !== undefined && exitCode !== 0;
  const failed = !success || hasNonZeroExit;

  if (!failed && exitCode === undefined) {
    let message = `Command running in background with shell_id: ${shellId}`;
    if (outputFilePath) message += `. Output is being written to: ${outputFilePath}`;
    parts.push(message);
  } else if (failed) {
    let header = 'Command failed';
    if (hasNonZeroExit) header += ` with exit code ${exitCode}`;
    if (error) header += `: ${error}`;
    parts.push(header);
  } else {
    parts.push('Command completed successfully.');
  }

  if (outputFilePath && outputTruncated && exitCode !== undefined) {
    const size = outputFileSize === undefined ? 'unknown size' : `${outputFileSize} bytes`;
    parts.push(`Output too large (${size}). Full output saved to: ${outputFilePath}`);
  }

  if (output) {
    parts.push(`${outputTruncated && exitCode !== undefined ? 'Preview' : 'Output'}:\n${output}`);
  } else {
    if (stdout) parts.push(`Output:\n${stdout}`);
    if (stderr) parts.push(`Stderr:\n${stderr}`);
  }

  return parts.join('\n\n');
};
