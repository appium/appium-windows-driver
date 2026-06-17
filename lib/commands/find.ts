import {util} from 'appium/support.js';
import type {WindowsDriver} from '../driver.js';

/** Proxies find-element request to WinAppDriver (`/element` or `/elements`). */
export async function findElOrEls(
  this: WindowsDriver,
  strategy: string,
  selector: string,
  mult: true,
  context?: string,
): Promise<any[]>;
export async function findElOrEls(
  this: WindowsDriver,
  strategy: string,
  selector: string,
  mult: false,
  context?: string,
): Promise<any>;
export async function findElOrEls(
  this: WindowsDriver,
  strategy: string,
  selector: string,
  mult: boolean,
  context?: string,
): Promise<any> {
  const endpoint = `/element${context ? `/${util.unwrapElement(context)}/element` : ''}${mult ? 's' : ''}`;
  // This is either an array if mult is true or an object if mult is false
  return await this.winAppDriver.sendCommand(endpoint, 'POST', {
    using: strategy,
    value: selector,
  });
}
