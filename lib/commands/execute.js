import _ from 'lodash';
import { errors } from 'appium-base-driver';
import log from '../logger';
import { POWER_SHELL_FEATURE } from '../constants';

const commands = {};

const POWER_SHELL_SCRIPT_PATTERN = /^powerShell$/;
const NATIVE_COMMANDS_MAPPING = {
  startRecordingScreen: 'startRecordingScreen',
  stopRecordingScreen: 'stopRecordingScreen',
};

commands.execute = async function execute (script, args) {
  if (script.match(/^windows:/)) {
    log.info(`Executing native command '${script}'`);
    script = script.replace(/^windows:/, '').trim();
    return await this.executeWindowsCommand(script, _.isArray(args) ? args[0] : args);
  } else if (POWER_SHELL_SCRIPT_PATTERN.test(script)) {
    this.ensureFeatureEnabled(POWER_SHELL_FEATURE);
    return await this.execPowerShell(script, _.isArray(args) ? _.first(args) : args);
  }
  throw new errors.NotImplementedError();
};

commands.executeWindowsCommand = async function executeWindowsCommand (command, opts = {}) {
  if (!_.has(NATIVE_COMMANDS_MAPPING, command)) {
    throw new errors.UnknownCommandError(`Unknown windows command "${command}". ` +
      `Only ${_.keys(NATIVE_COMMANDS_MAPPING)} commands are supported.`);
  }
  return await this[NATIVE_COMMANDS_MAPPING[command]](opts);
};

export default commands;
