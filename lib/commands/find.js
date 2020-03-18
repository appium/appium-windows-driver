import { util } from 'appium-support';


const commands = {};

commands.findElOrEls = async function findElOrEls (strategy, selector, mult, context) {
  context = util.unwrapElement(context);
  const endpoint = `/element${context ? `/${context}/element` : ''}${mult ? 's' : ''}`;

  // This is either an array if mult is true or an object if mult is false
  return await this.winAppDriver.sendCommand(endpoint, 'POST', {
    using: strategy,
    value: selector,
  });
};


export { commands };
export default commands;
