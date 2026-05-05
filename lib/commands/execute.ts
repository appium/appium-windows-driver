import _ from 'lodash';
import type {StringRecord} from '@appium/types';
import {POWER_SHELL_FEATURE} from '../constants';
import type {WindowsDriver} from '../driver';
import type {ExecPowerShellOptions} from './powershell';

const POWER_SHELL_SCRIPT = 'powerShell';
const EXECUTE_SCRIPT_PREFIX = 'windows:';

type ExecuteMethodArgs = readonly unknown[] | readonly [StringRecord] | Readonly<StringRecord>;

/** Handles `execute` / `executeScript` for PowerShell and `windows:` extension commands. */
export async function execute(
  this: WindowsDriver,
  script: string,
  args?: ExecuteMethodArgs,
): Promise<unknown> {
  if (script === POWER_SHELL_SCRIPT) {
    this.assertFeatureEnabled(POWER_SHELL_FEATURE);
    return await this.execPowerShell(preprocessExecuteMethodArgs(args) as ExecPowerShellOptions);
  }

  this.log.info(`Executing extension command '${script}'`);
  const formattedScript = _.isString(script)
    ? script.trim().replace(/^windows:\s*/, `${EXECUTE_SCRIPT_PREFIX} `)
    : String(script);
  const preprocessedArgs = preprocessExecuteMethodArgs(args);
  return await this.executeMethod(formattedScript, [preprocessedArgs]);
}

function preprocessExecuteMethodArgs(args?: ExecuteMethodArgs): StringRecord {
  return (_.isArray(args) ? _.first(args) : args) ?? {};
}
