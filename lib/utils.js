import _ from 'lodash';
import { net } from 'appium/support';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import B from 'bluebird';

const execAsync = promisify(exec);

/**
 * This API triggers UAC when necessary
 * unlike the 'spawn' call used by teen_process's exec.
 * See https://github.com/nodejs/node-v0.x-archive/issues/6797
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {import('node:child_process').ExecOptions & {timeoutMs?: number}} opts
 * @returns {Promise<{stdout: string; stderr: string;}>}
 * @throws {import('node:child_process').ExecException}
 */
export async function shellExec(cmd, args = [], opts = {}) {
  const {
    timeoutMs = 60 * 1000 * 5
  } = opts;
  const fullCmd = [cmd, ...args].map(escapeWindowsArg).join(' ');
  const { stdout, stderr } = await B.resolve(execAsync(fullCmd, opts))
    .timeout(timeoutMs, `The command '${fullCmd}' timed out after ${timeoutMs}ms`);
  return {
    stdout: _.isString(stdout) ? stdout : stdout.toString(),
    stderr: _.isString(stderr) ? stderr : stderr.toString(),
  };
}

/**
 * Escapes a string to be used as a Windows command line argument
 *
 * @param {string} arg
 * @returns {string}
 */
function escapeWindowsArg(arg) {
  if (!arg) {
    return '""';
  }

  const needsQuotes = /[\s"]/g.test(arg);
  if (!needsQuotes) {
    return arg;
  }

  // Escape double quotes and backslashes before quotes
  const escaped = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1');
  return `"${escaped}"`;
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
