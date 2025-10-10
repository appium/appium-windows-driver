import _ from 'lodash';
import { net } from 'appium/support';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import B from 'bluebird';
import { log } from './logger';

const execAsync = promisify(exec);

/**
 * This API triggers UAC when necessary
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {import('node:child_process').ExecOptions & {timeoutMs?: number}} opts
 * @returns {Promise<{stdout: string; stderr: string;}>}
 * @throws {import('node:child_process').ExecException}
 *
 * Notes:
 * - If the UAC prompt is cancelled by the user, Start-Process returns a non-zero exit code.
 */
export async function runElevated(cmd, args = [], opts = {}) {
  const {
    timeoutMs = 60 * 1000 * 5
  } = opts;

  const escapePSSingleQuoted = (/** @type {string} */ str) => `'${String(str).replace(/'/g, "''")}'`;
  const psFilePath = escapePSSingleQuoted(cmd);
  const psArgList = _.isEmpty(args) ? "''" : args.map(escapePSSingleQuoted).join(',');
  // Build the PowerShell Start-Process command (safe quoting for inner tokens)
  const psCommand = `Start-Process -FilePath ${psFilePath} -ArgumentList ${psArgList} -Verb RunAs`;
  // Wrap the PowerShell command in double-quotes for the outer shell call.
  // We avoid additional interpolation here by using only single-quoted literals inside the PS command.
  const fullCmd = `powershell -NoProfile -Command "${psCommand}"`;
  log.debug(`Executing command: ${fullCmd}`);
  const { stdout, stderr } = /** @type {any} */ (
    await B.resolve(execAsync(fullCmd, opts))
      .timeout(timeoutMs, `The command '${fullCmd}' timed out after ${timeoutMs}ms`)
  );
  return {
    stdout: _.isString(stdout) ? stdout : stdout.toString(),
    stderr: _.isString(stderr) ? stderr : stderr.toString(),
  };
}

/**
 *
 * @param {string} srcUrl
 * @param {string} dstPath
 * @returns {Promise<void>}
 */
export async function downloadToFile(srcUrl, dstPath) {
  await net.downloadFile(srcUrl, dstPath);
}
