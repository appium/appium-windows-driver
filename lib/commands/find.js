import _ from 'lodash';
import { errors } from 'appium-base-driver';
import { util } from 'appium-support';


const commands = {};

commands.findElOrEls = async function findElOrEls (strategy, selector, mult, context) {
  context = util.unwrapElement(context);
  const endpoint = `/element${context ? `/${context}/element` : ''}${mult ? 's' : ''}`;

  // This is either an array is mult === true
  // or an object if mult === false
  let els;
  try {
    await this.implicitWaitForCondition(async () => {
      try {
        els = await this.winAppDriver.sendCommand(endpoint, 'POST', {
          using: strategy,
          value: selector,
        });
      } catch (err) {
        els = [];
      }
      // we succeed if we get some elements
      return !_.isEmpty(els);
    });
  } catch (err) {
    if (err.message && err.message.match(/Condition unmet/)) {
      // condition was not met setting res to empty array
      els = [];
    } else {
      throw err;
    }
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
