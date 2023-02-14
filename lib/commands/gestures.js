import _ from 'lodash';
import {
  MOUSE_BUTTON_ACTION,
  MOUSE_BUTTON,
  KEY_ACTION,
  toModifierInputs,
  handleInputs,
  toMouseButtonInput,
  toMouseMoveInput,
} from './winapi/user32';
import { errors } from 'appium/driver';
import B from 'bluebird';

const commands = {};

commands.windowsClick = async function windowsClick (opts = {}) {
  const {
    elementId,
    x, y,
    button = MOUSE_BUTTON.LEFT,
    keyModifierFlags,
    durationMs,
  } = opts;

  const modifierKeyDownInputs = [];
  const modifierKeyUpInputs = [];
  if (_.isInteger(keyModifierFlags) && keyModifierFlags > 0) {
    const parsedDownInputs = toModifierInputs(keyModifierFlags, KEY_ACTION.DOWN);
    if (_.isEmpty(parsedDownInputs)) {
      this.log.info(`No known key modifier flags have been parsed from ${keyModifierFlags}`);
    } else {
      modifierKeyDownInputs.push(...parsedDownInputs);
      // depressing keys in the reversed order
      modifierKeyUpInputs.push(...toModifierInputs(keyModifierFlags, KEY_ACTION.UP));
      _.reverse(modifierKeyUpInputs);
    }
  }

  const hasX = _.isInteger(x);
  const hasY = _.isInteger(y);
  if (!elementId && !hasX && !hasY) {
    throw new errors.InvalidArgumentError('Either element identifier or absolute coordinates must be provided');
  }

  let clickDownInput;
  let clickUpInput;
  let moveInput;
  if (elementId) {
    if (hasX && !hasY || !hasX && hasY) {
      throw new errors.InvalidArgumentError('Both relative element coordinates must be provided');
    }

    let clickX = x;
    let clickY = y;
    const {x: left, y: top} = await this.winAppDriver.sendCommand(`/element/${elementId}/location`, 'GET');
    if (!hasX && !hasY) {
      const {width, height} = await this.winAppDriver.sendCommand(`/element/${elementId}/size`, 'GET');
      clickX = left + width / 2;
      clickY = top + height / 2;
    } else {
      // coordinates relative to the element's left top corner have been provided
      clickX += left;
      clickY += top;
    }

    [clickDownInput, clickUpInput, moveInput] = await B.all([
      toMouseButtonInput({button, action: MOUSE_BUTTON_ACTION.DOWN}),
      toMouseButtonInput({button, action: MOUSE_BUTTON_ACTION.UP}),
      toMouseMoveInput({x: clickX, y: clickY}),
    ]);
  } else {
    if (!hasX || !hasY) {
      throw new errors.InvalidArgumentError('Both absolute coordinates must be provided');
    }

    [clickDownInput, clickUpInput, moveInput] = await B.all([
      toMouseButtonInput({button, action: MOUSE_BUTTON_ACTION.DOWN}),
      toMouseButtonInput({button, action: MOUSE_BUTTON_ACTION.UP}),
      toMouseMoveInput({x, y}),
    ]);
  }

  if (!_.isEmpty(modifierKeyDownInputs)) {
    await handleInputs(modifierKeyDownInputs);
  }
  const mouseInputs = [moveInput, clickDownInput];
  if (_.isInteger(durationMs) && durationMs > 0) {
    await handleInputs(mouseInputs);
    await B.delay(durationMs);
    await handleInputs(clickUpInput);
  } else {
    mouseInputs.push(clickUpInput);
    await handleInputs(mouseInputs);
  }
  if (!_.isEmpty(modifierKeyUpInputs)) {
    await handleInputs(modifierKeyUpInputs);
  }
};

export { commands };
export default commands;
