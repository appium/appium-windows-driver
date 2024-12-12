import _ from 'lodash';
import { fs, tempDir } from 'appium/support';
import { exec } from 'teen_process';
import path from 'path';
import B from 'bluebird';

const commands = {};

const EXECUTION_POLICY = {
  REMOTE_SIGNED: 'RemoteSigned',
  UNDEFINED: 'Undefined',
  RESTRICTED: 'Restricted',
};
const POWER_SHELL = 'powershell.exe';


/**
 * @typedef {Object} ExecPowerShellOptions
 * @property {string?} script A valid Power Shell script to execute
 * @property {string?} command A valid Power Shell command to execute
 */

/**
 * Executes the given Power Shell command or a whole script based on the
 * given options. Either of these options must be provided. If both are provided
 * then the `command` one gets the priority.
 * Note that Power Shell command cannot contain line breaks. Consider making it
 * to a script in such case.
 * Note that by default Power Shell blocks scripts execution, so the script must
 * temporarily switch user execution policy if necessary and restore it afterwards.
 * This makes scripts slightly less performant, as single commands.
 *
 * @param {ExecPowerShellOptions} opts
 * @returns {Promise<string>} The actual stdout of the given command/script
 * @throws {Error} If the exit code of the given command/script is not zero.
 * The actual stderr output is set to the error message value.
 */
commands.execPowerShell = async function execPowerShell (opts) {
  const {
    script,
    command,
  } = opts ?? {};
  if (!script && !command) {
    throw this.log.errorWithException('Power Shell script/command must not be empty');
  }
  if (/\n/.test(command ?? '')) {
    throw this.log.errorWithException('Power Shell commands cannot contain line breaks');
  }
  const shouldRunScript = !command && !!script;

  let tmpRoot;
  let userExecutionPolicy;
  try {
    let tmpScriptPath;
    if (shouldRunScript) {
      tmpRoot = await tempDir.openDir();
      tmpScriptPath = path.resolve(tmpRoot, 'appium_script.ps1');
      await fs.writeFile(tmpScriptPath, script, 'utf8');
    }
    /** @type {string[]} */
    const psArgs = [];
    if (command) {
      psArgs.push('-command', command);
    } else {
      const {stdout} = await exec(POWER_SHELL, ['-command', 'Get-ExecutionPolicy -Scope CurrentUser']);
      userExecutionPolicy = _.trim(stdout);
      if ([EXECUTION_POLICY.RESTRICTED, EXECUTION_POLICY.UNDEFINED].includes(userExecutionPolicy)) {
        this.log.debug(`Temporarily changing Power Shell execution policy to ${EXECUTION_POLICY.REMOTE_SIGNED} ` +
          'to run the given script');
        await exec(POWER_SHELL, [
          '-command', `Set-ExecutionPolicy -ExecutionPolicy ${EXECUTION_POLICY.REMOTE_SIGNED} -Scope CurrentUser`
        ]);
      } else {
        // There is no need to change the policy, scripts are allowed
        userExecutionPolicy = null;
      }
      if (tmpScriptPath) {
        psArgs.push('-file', tmpScriptPath);
      }
    }
    this.log.info(`Running Power Shell with arguments: ${psArgs}`);
    try {
      const {stdout} = await exec(POWER_SHELL, psArgs);
      return stdout;
    } catch (e) {
      throw new Error(e.stderr || e.message);
    }
  } finally {
    await B.all([
      (async () => {
        if (userExecutionPolicy) {
          await exec(POWER_SHELL, [
            '-command', `Set-ExecutionPolicy -ExecutionPolicy ${userExecutionPolicy} -Scope CurrentUser`
          ]);
        }
      })(),
      (async () => {
        if (tmpRoot) {
          await fs.rimraf(tmpRoot);
        }
      })()
    ]);
  }
};

export { commands };
export default commands;
