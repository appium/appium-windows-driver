import _ from 'lodash';
import { util } from 'appium/support';

/**
 * @typedef {Object} Size
 * @property {number} width
 * @property {number} height
 */

/**
 * @this {import('../driver').WindowsDriver}
 * @returns {Promise<Size>}
 */
async function getScreenSize () {
  const dimensions = await this.execPowerShell({
    command: 'Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Size',
  });
  this.log.debug(`Screen size information retrieved: ${dimensions}`);
  const match = /^\s*(True|False)\s+(\d+)\s+(\d+)/m.exec(dimensions);
  if (!match) {
    throw new Error('Cannot retrieve the screen size. Check the server log for more details');
  }
  return {
    width: parseInt(match[2], 10),
    height: parseInt(match[3], 10),
  };
}

const commands = {};

// The next two commands are required
// for proper `-image` locator functionality
/**
 * @returns {Promise<Size>}
 */
commands.getWindowSize = async function getWindowSize () {
  const size = await this.winAppDriver.sendCommand('/window/size', 'GET');
  if (_.isPlainObject(size)) {
    return size;
  }
  // workaround for https://github.com/microsoft/WinAppDriver/issues/1104
  this.log.info('Cannot retrieve window size from WinAppDriver');
  this.log.info('Falling back to Windows Forms to calculate dimensions');
  return await getScreenSize.bind(this)();
};

// a workaround for https://github.com/appium/appium/issues/15923
commands.getWindowRect = async function getWindowRect () {
  const {width, height} = await this.getWindowSize();
  let [x, y] = [0, 0];
  try {
    const handle = await this.winAppDriver.sendCommand('/window_handle', 'GET');
    ({x, y} = await this.winAppDriver.sendCommand(`/window/${handle}/position`, 'GET'));
  } catch (e) {
    this.log.warn(
      `Cannot fetch the window position. Defaulting to zeroes. Original error: ${e.message}`
    );
  }
  return {x, y, width, height};
};

// a workaround for https://github.com/appium/appium/issues/15923
commands.setWindowRect = async function setWindowRect (x, y, width, height) {
  let didProcess = false;
  if (!_.isNil(width) && !_.isNil(height)) {
    await this.winAppDriver.sendCommand('/window/size', 'POST', {width, height});
    didProcess = true;
  }
  if (!_.isNil(x) && !_.isNil(y)) {
    const handle = await this.winAppDriver.sendCommand('/window_handle', 'GET');
    await this.winAppDriver.sendCommand(`/window/${handle}/position`, 'POST', {x, y});
    didProcess = true;
  }
  if (!didProcess) {
    this.log.info('Either x and y or width and height must be defined. Doing nothing');
  }
};

commands.getScreenshot = async function getScreenshot () {
  // TODO: This trick ensures the resulting data is encoded according to RFC4648 standard
  // TODO: remove it as soon as WAD returns the screenshot data being properly encoded
  return Buffer.from(await this.winAppDriver.sendCommand('/screenshot', 'GET'), 'base64')
    .toString('base64');
};

// a workaround for https://github.com/appium/appium/issues/16316
commands.getElementRect = async function getElementRect (el) {
  const elId = util.unwrapElement(el);
  const {x, y} = await this.winAppDriver.sendCommand(`/element/${elId}/location`, 'GET');
  const {width, height} = await this.winAppDriver.sendCommand(`/element/${elId}/size`, 'GET');
  return {x, y, width, height};
};

export { commands };
export default commands;
