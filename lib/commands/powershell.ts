import _ from 'lodash';
import {fs, tempDir} from 'appium/support';
import {exec} from 'teen_process';
import path from 'node:path';
import type {WindowsDriver} from '../driver';

const EXECUTION_POLICY = {
  REMOTE_SIGNED: 'RemoteSigned',
  UNDEFINED: 'Undefined',
  RESTRICTED: 'Restricted',
};
const POWER_SHELL = 'powershell.exe';

export interface ExecPowerShellOptions {
  /** A valid PowerShell script to execute */
  script?: string;
  /** A valid PowerShell command to execute */
  command?: string;
}

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
 * @returns The stdout of the given command or script
 * @throws If the exit code of the given command or script is not zero (stderr is used as the message when present).
 */
export async function execPowerShell(
  this: WindowsDriver,
  opts?: ExecPowerShellOptions,
): Promise<string> {
  const {script, command} = opts ?? {};
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
    const psArgs: string[] = [];
    if (command) {
      psArgs.push('-command', command);
    } else {
      const {stdout} = await exec(POWER_SHELL, [
        '-command',
        'Get-ExecutionPolicy -Scope CurrentUser',
      ]);
      userExecutionPolicy = _.trim(stdout);
      if ([EXECUTION_POLICY.RESTRICTED, EXECUTION_POLICY.UNDEFINED].includes(userExecutionPolicy)) {
        this.log.debug(
          `Temporarily changing Power Shell execution policy to ${EXECUTION_POLICY.REMOTE_SIGNED} ` +
            'to run the given script',
        );
        await exec(POWER_SHELL, [
          '-command',
          `Set-ExecutionPolicy -ExecutionPolicy ${EXECUTION_POLICY.REMOTE_SIGNED} -Scope CurrentUser`,
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
    } catch (e: unknown) {
      const err = e as {stderr?: string; message?: string};
      throw new Error(err.stderr || err.message || String(e), {cause: e});
    }
  } finally {
    await Promise.all([
      (async () => {
        if (userExecutionPolicy) {
          await exec(POWER_SHELL, [
            '-command',
            `Set-ExecutionPolicy -ExecutionPolicy ${userExecutionPolicy} -Scope CurrentUser`,
          ]);
        }
      })(),
      (async () => {
        if (tmpRoot) {
          await fs.rimraf(tmpRoot);
        }
      })(),
    ]);
  }
}
