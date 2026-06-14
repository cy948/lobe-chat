import { formatCommandOutputFileSize } from './formatCommandOutput';

export interface FormatCommandResultParams {
  error?: string;
  exitCode?: number;
  output?: string;
  outputFilePath?: string;
  outputFileSize?: number;
  outputTruncated?: boolean;
  shellId?: string;
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
  exitCode,
}: FormatCommandResultParams): string => {
  const parts: string[] = [];

  // `success` means the command/session request succeeded; `exitCode` tells
  // whether the underlying process has exited and how it finished.
  const hasNonZeroExit = exitCode !== undefined && exitCode !== 0;
  const failed = !success || hasNonZeroExit;

  if (failed) {
    let header = 'Command failed';
    if (hasNonZeroExit) header += ` with exit code ${exitCode}`;
    if (error) header += `: ${error}`;
    parts.push(header);
  } else if (exitCode === undefined) {
    let message = `Command running in background with shell_id: ${shellId}`;
    if (outputFilePath) message += `. Output is being written to: ${outputFilePath}`;
    parts.push(message);
  } else {
    parts.push('Command completed successfully.');
  }

  if (outputFilePath && outputTruncated && exitCode !== undefined) {
    parts.push(
      `Output too large (${formatCommandOutputFileSize(outputFileSize)}). Full output saved to: ${outputFilePath}`,
    );
  }

  if (output) {
    parts.push(`${outputTruncated && exitCode !== undefined ? 'Preview' : 'Output'}:\n${output}`);
  }

  return parts.join('\n\n');
};
