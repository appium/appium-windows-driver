import _ from 'lodash';
import { util } from 'appium/support';

/**
 * @typedef {Object} Size
 * @property {number} width
 * @property {number} height
 */

/**
 * @this {WindowsDriver}
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

// The next two commands are required
// for proper `-image` locator functionality
/**
 * @this {WindowsDriver}
 * @returns {Promise<Size>}
 */
export async function getWindowSize () {
  const size = await this.winAppDriver.sendCommand(
    '/window/size', 'GET'
  );
  if (_.isPlainObject(size)) {
    return /** @type {Size} */ (size);
  }
  // workaround for https://github.com/microsoft/WinAppDriver/issues/1104
  this.log.info('Cannot retrieve window size from WinAppDriver');
  this.log.info('Falling back to Windows Forms to calculate dimensions');
  return await getScreenSize.bind(this)();
};

// a workaround for https://github.com/appium/appium/issues/15923
/**
 * @this {WindowsDriver}
 * @returns {Promise<import('@appium/types').Rect>}
 */
export async function getWindowRect () {
  const {width, height} = await getWindowSize.bind(this)();
  let [x, y] = [0, 0];
  try {
    const handle = await this.winAppDriver.sendCommand(
      '/window_handle', 'GET'
    );
    ({x, y} = /** @type {import('@appium/types').Position} */ (
      await this.winAppDriver.sendCommand(
        `/window/${handle}/position`, 'GET'
      ))
    );
  } catch (e) {
    this.log.warn(
      `Cannot fetch the window position. Defaulting to zeroes. Original error: ${e.message}`
    );
  }
  return {x, y, width, height};
}

// a workaround for https://github.com/appium/appium/issues/15923
/**
 * @this {WindowsDriver}
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {Promise<import('@appium/types').Rect>}
 */
export async function setWindowRect (x, y, width, height) {
  let didProcess = false;
  if (!_.isNil(width) && !_.isNil(height)) {
    await this.winAppDriver.sendCommand(
      '/window/size', 'POST', {width, height}
    );
    didProcess = true;
  }
  if (!_.isNil(x) && !_.isNil(y)) {
    const handle = await this.winAppDriver.sendCommand(
      '/window_handle', 'GET'
    );
    await this.winAppDriver.sendCommand(
      `/window/${handle}/position`, 'POST', {x, y}
    );
    didProcess = true;
  }
  if (!didProcess) {
    this.log.info('Either x and y or width and height must be defined. Doing nothing');
  }
  return {x, y, width, height};
}

/**
 * @this {WindowsDriver}
 * @returns {Promise<string>}
 */
export async function getScreenshot () {
  // TODO: This trick ensures the resulting data is encoded according to RFC4648 standard
  // TODO: remove it as soon as WAD returns the screenshot data being properly encoded
  const originalPayload = await this.winAppDriver.sendCommand(
    '/screenshot', 'GET'
  );
  return Buffer.from(/** @type {string} */ (originalPayload), 'base64')
    .toString('base64');
}

// a workaround for https://github.com/appium/appium/issues/16316
/**
 *
 * @this {WindowsDriver}
 * @param {string} el
 * @returns {Promise<import('@appium/types').Rect>}
 */
export async function getElementRect (el) {
  const elId = util.unwrapElement(el);
  const {x, y} = /** @type {import('@appium/types').Position} */ (
    await this.winAppDriver.sendCommand(`/element/${elId}/location`, 'GET')
  );
  const {width, height} = /** @type {import('@appium/types').Size} */ (
    await this.winAppDriver.sendCommand(
      `/element/${elId}/size`, 'GET'
    )
  );
  return {x, y, width, height};
}

/**
 * @typedef {import('../driver').WindowsDriver} WindowsDriver
 */
