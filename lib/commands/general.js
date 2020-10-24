import _ from 'lodash';
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
  return await getScreenSize();
};

async function getScreenSize () {
  const dimensions = await this.execPowerShell({
    command: 'Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Size',
  });
  log.debug(`Screen size information retrieved: ${dimensions}`);
  const match = /^\s*(True|False)\s+(\d+)\s+(\d+)/m.exec(dimensions);
  if (!match) {
    throw new Error('Cannot retrieve the screen size. Check the server log for more details');
  }
  return {
    width: parseInt(match[2], 10),
    height: parseInt(match[3], 10),
  };
}

commands.getScreenshot = async function getScreenshot () {
  return await this.winAppDriver.sendCommand('/screenshot', 'GET');
};

export { commands };
export default commands;
