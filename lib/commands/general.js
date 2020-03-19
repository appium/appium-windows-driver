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
      'Falling back to Windows Forms to calculate dimensions');
  const widthMatch = await getDimension('Width');
  const heightMatch = await getDimension('Height');
  if (!widthMatch || !heightMatch) {
    throw new Error('Cannot retrieve the screen size. Check the server log for more details');
  }
  return {
    width: parseInt(widthMatch, 10),
    height: parseInt(heightMatch, 10),
  };
};

async function getDimension (dimensionType) {
  const {stdout} = await exec('powershell', [
    '-command', 'Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.Screen]::AllScreens::Bounds.Size.' + dimensionType,
  ]);
  log.debug(dimensionType + ' : ' + stdout);
  return stdout;
}

commands.getScreenshot = async function getScreenshot () {
  return await this.winAppDriver.sendCommand('/screenshot', 'GET');
};

export { commands };
export default commands;
