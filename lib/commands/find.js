import { util } from 'appium/support';

/**
 *
 * @this {WindowsDriver}
 * @param {string} strategy
 * @param {string} selector
 * @param {boolean} mult
 * @param {string} [context]
 * @returns
 */
export async function findElOrEls (strategy, selector, mult, context) {
  const endpoint = `/element${context ? `/${util.unwrapElement(context)}/element` : ''}${mult ? 's' : ''}`;
  // This is either an array if mult is true or an object if mult is false
  return await this.winAppDriver.sendCommand(endpoint, 'POST', {
    using: strategy,
    value: selector,
  });
}

/**
 * @typedef {import('../driver').WindowsDriver} WindowsDriver
 */
