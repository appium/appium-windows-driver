import type {Position, Rect, Size} from '@appium/types';
import {util} from 'appium/support';
import type {WindowsDriver} from '../driver';
import {isPlainObject} from '../utils';

// The next two commands are required
// for proper `-image` locator functionality

/** Window size from WAD, or primary screen size via PowerShell if WAD omits it. */
export async function getWindowSize(this: WindowsDriver): Promise<Size> {
  const size = await this.winAppDriver.sendCommand('/window/size', 'GET');
  if (isPlainObject(size)) {
    return size as Size;
  }
  // workaround for https://github.com/microsoft/WinAppDriver/issues/1104
  this.log.info('Cannot retrieve window size from WinAppDriver');
  this.log.info('Falling back to Windows Forms to calculate dimensions');
  return await getScreenSize.bind(this)();
}

// a workaround for https://github.com/appium/appium/issues/15923

/** Window bounding rect (position may default to zero if WAD cannot provide it). */
export async function getWindowRect(this: WindowsDriver): Promise<Rect> {
  const {width, height} = await getWindowSize.bind(this)();
  let [x, y] = [0, 0];
  try {
    const handle = await this.winAppDriver.sendCommand('/window_handle', 'GET');
    ({x, y} = (await this.winAppDriver.sendCommand(
      `/window/${handle}/position`,
      'GET',
    )) as Position);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    this.log.warn(`Cannot fetch the window position. Defaulting to zeroes. Original error: ${msg}`);
  }
  return {x, y, width, height};
}

// a workaround for https://github.com/appium/appium/issues/15923

/** Sets window size and/or position when the corresponding arguments are provided. */
export async function setWindowRect(
  this: WindowsDriver,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<Rect> {
  let didProcess = false;
  if (width != null && height != null) {
    await this.winAppDriver.sendCommand('/window/size', 'POST', {width, height});
    didProcess = true;
  }
  if (x != null && y != null) {
    const handle = await this.winAppDriver.sendCommand('/window_handle', 'GET');
    await this.winAppDriver.sendCommand(`/window/${handle}/position`, 'POST', {x, y});
    didProcess = true;
  }
  if (!didProcess) {
    this.log.info('Either x and y or width and height must be defined. Doing nothing');
  }
  return {x, y, width, height};
}

/** Screenshot as base64 PNG (normalized to RFC 4648 padding). */
export async function getScreenshot(this: WindowsDriver): Promise<string> {
  // TODO: This trick ensures the resulting data is encoded according to RFC4648 standard
  // TODO: remove it as soon as WAD returns the screenshot data being properly encoded
  const originalPayload = await this.winAppDriver.sendCommand('/screenshot', 'GET');
  return Buffer.from(originalPayload as string, 'base64').toString('base64');
}

// a workaround for https://github.com/appium/appium/issues/16316

/** Element bounding rect from separate WAD location and size calls. */
export async function getElementRect(this: WindowsDriver, el: string): Promise<Rect> {
  const elId = util.unwrapElement(el);
  const {x, y} = (await this.winAppDriver.sendCommand(
    `/element/${elId}/location`,
    'GET',
  )) as Position;
  const {width, height} = (await this.winAppDriver.sendCommand(
    `/element/${elId}/size`,
    'GET',
  )) as Size;
  return {x, y, width, height};
}

async function getScreenSize(this: WindowsDriver): Promise<Size> {
  const dimensions = await this.execPowerShell({
    command:
      'Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Size',
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
