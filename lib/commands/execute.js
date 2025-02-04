import _ from 'lodash';
import { POWER_SHELL_FEATURE } from '../constants';

const POWER_SHELL_SCRIPT = 'powerShell';
const EXECUTE_SCRIPT_PREFIX = 'windows:';

/**
 *
 * @this {WindowsDriver}
 * @param {string} script
 * @param {ExecuteMethodArgs} [args]
 * @returns {Promise<any>}
 */
export async function execute (script, args) {
  if (script === POWER_SHELL_SCRIPT) {
    this.assertFeatureEnabled(POWER_SHELL_FEATURE);
    return await this.execPowerShell(
      /** @type {import('./powershell').ExecPowerShellOptions} */ (preprocessExecuteMethodArgs(args))
    );
  }

  this.log.info(`Executing extension command '${script}'`);
  const formattedScript = _.isString(script)
    ? script.trim().replace(/^windows:\s*/, `${EXECUTE_SCRIPT_PREFIX} `)
    : String(script);
  const preprocessedArgs = preprocessExecuteMethodArgs(args);
  return await this.executeMethod(formattedScript, [preprocessedArgs]);
}

/**
 * Massages the arguments going into an execute method.
 *
 * @param {ExecuteMethodArgs} [args]
 * @returns {StringRecord}
 */
function preprocessExecuteMethodArgs(args) {
  return /** @type {StringRecord} */ ((_.isArray(args) ? _.first(args) : args) ?? {});
}

/**
 * @typedef {import('../driver').WindowsDriver} WindowsDriver
 * @typedef {import('@appium/types').StringRecord} StringRecord
 * @typedef {readonly any[] | readonly [StringRecord] | Readonly<StringRecord>} ExecuteMethodArgs
 */
