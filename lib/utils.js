import { util, net } from 'appium/support';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import B from 'bluebird';
import _ from 'lodash';
import { errors } from 'appium/driver';

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
  const fullCmd = util.quote([cmd, ...args]);
  return await B.resolve(execAsync(fullCmd, opts))
    .timeout(timeoutMs, `The command '${fullCmd}' timed out after ${timeoutMs}ms`);
}

/**
 * Assert the presence of particular keys in the given object
 *
 * @template {Object} T
 * @param {keyof T|(keyof T)[]} argNames one or more key names
 * @param {T} opts the object to check
 * @returns {T} the same given object
 */
export function requireArgs (argNames, opts) {
  for (const argName of (_.isArray(argNames) ? argNames : [argNames])) {
    if (!_.has(opts, argName)) {
      throw new errors.InvalidArgumentError(`'${String(argName)}' argument must be provided`);
    }
  }
  return opts;
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
