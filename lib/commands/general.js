import _ from 'lodash';
import { exec } from 'teen_process';
import log from '../logger';

const commands = {};

// The next two commands are required
// for proper `-image` locator functionality
commands.getWindowSize = async function getWindowSize () {
  const size = await this.winAppDriver.sendCommand('/window/size', 'GET');
  if (_.isPlainObject(size)) {
    return size;
  }
  // workaround for https://github.com/microsoft/WinAppDriver/issues/1104
  log.info('Cannot retrieve window size from WinAppDriver. ' +
    'Falling back to WMIC usage');
  const {stdout} = await exec('wmic.exe', [
    'path', 'Win32_VideoController',
    'get', 'VideoModeDescription,CurrentVerticalResolution,CurrentHorizontalResolution',
    '/format:value',
  ]);
  log.debug(stdout);
  const widthMatch = /CurrentHorizontalResolution=(\d+)/.exec(stdout);
  const heightMatch = /CurrentVerticalResolution=(\d+)/.exec(stdout);
  if (!widthMatch || !heightMatch) {
    throw new Error('Cannot retrieve the screen size. Check the server log for more details');
  }
  return {
    width: parseInt(widthMatch[1], 10),
    height: parseInt(heightMatch[1], 10),
  };
};

commands.getScreenshot = async function getScreenshot () {
  return await this.winAppDriver.sendCommand('/screenshot', 'GET');
};

export { commands };
export default commands;
