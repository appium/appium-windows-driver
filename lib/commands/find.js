import _ from 'lodash';
import { errors } from 'appium-base-driver';
import { util } from 'appium-support';


const commands = {};

commands.findElOrEls = async function findElOrEls (strategy, selector, mult, context) {
  context = util.unwrapElement(context);
  const endpoint = `/element${context ? `/${context}/element` : ''}${mult ? 's' : ''}`;

  let els;
  try {
    await this.implicitWaitForCondition(async () => {
      try {
        // This is either an array if mult is true or an object if mult is false
        els = await this.winAppDriver.sendCommand(endpoint, 'POST', {
          using: strategy,
          value: selector,
        });
      } catch (e) {
        els = [];
      }
      // we succeed if we get some elements
      return !_.isEmpty(els);
    });
  } catch (err) {
    if (!/Condition unmet/.test(err.message)) {
      throw err;
    }
    // condition was not met setting res to empty array
    els = [];
  }
  if (mult) {
    return els;
  }
  if (_.isEmpty(els)) {
    throw new errors.NoSuchElementError();
  }
  return els;
};


export { commands };
export default commands;
