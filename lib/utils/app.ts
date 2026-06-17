import {net} from 'appium/support.js';
import {promisify} from 'node:util';
import {exec} from 'node:child_process';
import type {ExecOptions} from 'node:child_process';
import {withTimeout} from 'asyncbox';
import {log} from '../logger.js';

const execAsync = promisify(exec);

export interface RunElevatedOptions extends ExecOptions {
  timeoutMs?: number;
}

/**
 * This API triggers UAC when necessary
 *
 * @param cmd - Command to execute
 * @param args - Command arguments
 * @param opts - Execution options including timeout
 * @returns Promise with stdout and stderr
 * @throws ExecException
 *
 * Notes:
 * - If the UAC prompt is cancelled by the user, Start-Process returns a non-zero exit code.
 */
export async function runElevated(
  cmd: string,
  args: string[] = [],
  opts: RunElevatedOptions = {},
): Promise<{stdout: string; stderr: string}> {
  const {timeoutMs = 60 * 1000 * 5} = opts;

  const escapePSSingleQuoted = (str: string): string => `'${String(str).replace(/'/g, "''")}'`;
  const psFilePath = escapePSSingleQuoted(cmd);
  const psArgList = args.length === 0 ? "''" : args.map(escapePSSingleQuoted).join(',');
  // Build the PowerShell Start-Process command (safe quoting for inner tokens)
  const psCommand = `Start-Process -FilePath ${psFilePath} -ArgumentList ${psArgList} -Verb RunAs`;
  // Wrap the PowerShell command in double-quotes for the outer shell call.
  // We avoid additional interpolation here by using only single-quoted literals inside the PS command.
  const fullCmd = `powershell -NoProfile -Command "${psCommand}"`;
  log.debug(`Executing command: ${fullCmd}`);
  const {stdout, stderr} = await withTimeout(
    execAsync(fullCmd, opts),
    timeoutMs,
    `The command '${fullCmd}' timed out after ${timeoutMs}ms`,
  );
  return {
    stdout: typeof stdout === 'string' ? stdout : stdout.toString(),
    stderr: typeof stderr === 'string' ? stderr : stderr.toString(),
  };
}

/**
 * Downloads a file from a URL to a local path
 *
 * @param srcUrl - Source URL to download from
 * @param dstPath - Destination file path
 * @returns Promise that resolves when download is complete
 */
export async function downloadToFile(srcUrl: string, dstPath: string): Promise<void> {
  await net.downloadFile(srcUrl, dstPath);
}
