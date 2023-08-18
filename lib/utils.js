import { util} from 'appium/support';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';

const execAsync = promisify(exec);

/**
 * This API triggers UAC when necessary
 * unlike the 'spawn' call used by teen_process's exec.
 * See https://github.com/nodejs/node-v0.x-archive/issues/6797
 *
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<{stdout: string; stderr: string;}>}
 * @throws {import('node:child_process').ExecException}
 */
export async function shellExec(cmd, args = []) {
  return await execAsync(util.quote([cmd, ...args]));
}
