import { util } from 'appium/support';

const commands = {};
const { promisify } = require('util');
const sleep = promisify(setTimeout);

//This is needed to make clicks on -image elements work properly
commands.performActions = async function (actions) {
  //Workaround for https://github.com/appium/appium/issues/16268
  //Once WAD offers full W3C support for keyboard and mouse type pointer actions, this can be proxied directly to the /actions endpoint
  for (const command in actions) {
    if (actions[command].type === 'key') {
      this.log.info('Mapping keyboard actions');
      return await performKeyboardCommands.bind(this)(actions[command].actions);
    } else if (actions[command].type === 'pointer' && actions[command].parameters.pointerType === 'mouse') {
      this.log.info('Mapping mouse actions');
      return await performMouseCommands.bind(this)(actions[command].actions);
    } else {
      this.log.info('Going default actions route');
      return await this.winAppDriver.sendCommand('/actions', 'POST', {actions});
    }
  }
};

/*
  Supported actions:
  -> sendKeys(CharSequence... keys)
  -> sendKeysInTicks(CharSequence... keys)
*/
// TODO: remove once WAD offers W3C for keyboard input actions
async function performKeyboardCommands(actions) {
  const keysFormatted = formatKeyboardInput(actions);
  return await this.winAppDriver.sendCommand('/keys', 'POST', {'value': keysFormatted });
}

/*
  Supported actions:
  -> click()
  -> click(WebElement target)
  -> contextClick()
  -> contextClick(WebElement target)
  -> release()
  -> release(WebElement target)
  -> clickAndHold()
  -> clickAndHold(WebElement target)
  -> doubleClick()
  -> doubleClick(WebElement target)
  -> moveToElement(WebElement target)
  -> moveToElement(WebElement target, int xOffset, int yOffset)
  -> dragAndDrop(WebElement source, WebElement target)
  -> pause()

*/
// TODO: remove once WAD offers W3C support for pointer actions of type mouse
async function performMouseCommands(actions) {
  let result;
  for (const action in actions) {
    switch (actions[action].type) {
      case 'pointerMove':
        this.log.info(JSON.stringify(actions[action]));
        this.log.info('Done');
        result = await this.winAppDriver.sendCommand('/moveto', 'POST', getExpectedFormatForMouseMovement(actions[action]));
        break;
      case 'pointerDown':
        result = await this.winAppDriver.sendCommand('/buttondown', 'POST', {'button': actions[action].button });
        break;
      case 'pointerUp':
        result = await this.winAppDriver.sendCommand('/buttonup', 'POST', {'button': actions[action].button });
        break;
      case 'pause':
        await sleep(actions[action].duration);
        break;
      default:
        this.log.info('No mouse action mapped for type: ${JSON.stringify(actions[action].type)}, moving to next action');
    }
  };
  return result;
}

function formatKeyboardInput(actions) {
  const keys = new Array();
  actions.forEach((action) => {
    if (action.type === 'keyDown') {
      keys.push(action.value);
    }
  });
  return [keys.join('')];
}

function getExpectedFormatForMouseMovement(action) {
  const elementId = util.unwrapElement(action.origin);
  if (action.x !== 0 && action.y !== 0) {
    return { 'yoffset': action.y, 'xoffset': action.x, 'element': elementId };
  }
  return { 'element': elementId };
}

Object.assign(commands);
export default commands;