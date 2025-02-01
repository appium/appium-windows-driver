
//This is needed to make clicks on -image elements work properly
/**
 *
 * @this {WindowsDriver}
 * @param {any} actions
 * @returns {Promise<any>}
 */
export async function performActions (actions) {
  return await this.winAppDriver.sendCommand(
    '/actions', 'POST', {actions}
  );
}

/**
 * @typedef {import('../driver').WindowsDriver} WindowsDriver
 */
