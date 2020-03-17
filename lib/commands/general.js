const commands = {};

// The next two commands are required
// for proper `-image` locator functionality
commands.getWindowSize = async function getWindowSize () {
  return await this.winAppDriver.sendCommand('/window/size', 'GET');
};

commands.getScreenshot = async function getScreenshot () {
  return await this.winAppDriver.sendCommand('/screenshot', 'GET');
};

export { commands };
export default commands;
