import _ from 'lodash';
import {
  MOUSE_BUTTON_ACTION,
  MOUSE_BUTTON,
  KEY_ACTION,
  toModifierInputs,
  handleInputs,
  toMouseButtonInput,
  toMouseMoveInput,
  toMouseWheelInput,
} from './winapi/user32';
import { errors } from 'appium/driver';
import B from 'bluebird';
import { util } from 'appium/support';
import { isInvalidArgumentError } from './winapi/errors';


function preprocessError(e) {
  if (!isInvalidArgumentError(e)) {
    return e;
  }

  const err = new errors.InvalidArgumentError(e.message);
  err.stack = e.stack;
  return err;
}


function modifierKeysToInputs(modifierKeys) {
  if (_.isEmpty(modifierKeys)) {
    return [[], []];
  }

  const modifierKeyDownInputs = [];
  const modifierKeyUpInputs = [];
  let parsedDownInputs;
  try {
    parsedDownInputs = toModifierInputs(modifierKeys, KEY_ACTION.DOWN);
  } catch (e) {
    throw preprocessError(e);
  }
  this.log.debug(`Parsed ${util.pluralize('modifier key input', parsedDownInputs.length, true)}`);
  modifierKeyDownInputs.push(...parsedDownInputs);
  // depressing keys in the reversed order
  modifierKeyUpInputs.push(...toModifierInputs(modifierKeys, KEY_ACTION.UP));
  _.reverse(modifierKeyUpInputs);
  return [modifierKeyDownInputs, modifierKeyUpInputs];
}

async function toAbsoluteCoordinates(elementId, x, y) {
  const hasX = _.isInteger(x);
  const hasY = _.isInteger(y);

  if (!elementId && !hasX && !hasY) {
    throw new errors.InvalidArgumentError('Either element identifier or absolute coordinates must be provided');
  }

  if (!elementId) {
    if (!hasX || !hasY) {
      throw new errors.InvalidArgumentError('Both absolute coordinates must be provided');
    }
    this.log.debug(`Absolute click coordinates: (${x}, ${y})`);
    return [x, y];
  }

  if (hasX && !hasY || !hasX && hasY) {
    throw new errors.InvalidArgumentError('Both relative element coordinates must be provided');
  }

  let absoluteX = x;
  let absoluteY = y;
  const {x: left, y: top} = await this.winAppDriver.sendCommand(`/element/${elementId}/location`, 'GET');
  if (!hasX && !hasY) {
    const {width, height} = await this.winAppDriver.sendCommand(`/element/${elementId}/size`, 'GET');
    absoluteX = left + width / 2;
    absoluteY = top + height / 2;
  } else {
    // coordinates relative to the element's left top corner have been provided
    absoluteX += left;
    absoluteY += top;
  }
  this.log.debug(`Absolute click coordinates: (${absoluteX}, ${absoluteY})`);
  return [absoluteX, absoluteY];
}


const commands = {};

/**
 * @typedef {Object} ClickOptions
 * @property {string} elementId Hexadecimal identifier of the element to click on.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @property {number} x Integer horizontal coordinate of the click point. Both x and y coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @property {number} y Integer vertical coordinate of the click point. Both x and y coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @property {'left' | 'middle' | 'right' | 'back' | 'forward'} button [left] Name of
 * the mouse button to be clicked. An exception is thrown if an unknown button name
 * is provided.
 * @property {string[]|string} modifierKeys List of possible keys or a single key name to
 * depress while the click is being performed. Supported key names are: Shift, Ctrl, Alt, Win.
 * For example, in order to keep Ctrl+Alt depressed while clicking, provide the value of
 * ['ctrl', 'alt']
 * @property {number} durationMs The number of milliseconds to wait between pressing
 * and releasing the mouse button. By default no delay is applied, which simulates a
 * regular click.
 */

/**
 * Performs single click mouse gesture.
 *
 * @param {ClickOptions} opts
 * @throws {Error} If given options are not acceptable or the gesture has failed.
 */
commands.windowsClick = async function windowsClick (opts = {}) {
  const {
    elementId,
    x, y,
    button = MOUSE_BUTTON.LEFT,
    modifierKeys,
    durationMs,
  } = opts;

  const [modifierKeyDownInputs, modifierKeyUpInputs] = modifierKeysToInputs.bind(this)(modifierKeys);
  const [absoluteX, absoluteY] = await toAbsoluteCoordinates.bind(this)(elementId, x, y);
  let clickDownInput;
  let clickUpInput;
  let moveInput;
  try {
    [clickDownInput, clickUpInput, moveInput] = await B.all([
      toMouseButtonInput({button, action: MOUSE_BUTTON_ACTION.DOWN}),
      toMouseButtonInput({button, action: MOUSE_BUTTON_ACTION.UP}),
      toMouseMoveInput({x: absoluteX, y: absoluteY}),
    ]);
  } catch (e) {
    throw preprocessError(e);
  }

  try {
    if (!_.isEmpty(modifierKeyDownInputs)) {
      await handleInputs(modifierKeyDownInputs);
    }
    await handleInputs(moveInput);
    await handleInputs(clickDownInput);
    if (_.isInteger(durationMs) && durationMs > 0) {
      await B.delay(durationMs);
    }
    await handleInputs(clickUpInput);
  } finally {
    if (!_.isEmpty(modifierKeyUpInputs)) {
      await handleInputs(modifierKeyUpInputs);
    }
  }
};

/**
 * @typedef {Object} ScrollOptions
 * @property {string} elementId Hexadecimal identifier of the element to scroll.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @property {number} x Integer horizontal coordinate of the scroll point. Both x and y coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @property {number} y Integer vertical coordinate of the scroll point. Both x and y coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @property {number} deltaX Integer horizontal scroll delta. Either this value
 * or deltaY must be provided, but not both.
 * @property {number} deltaY Integer vertical scroll delta. Either this value
 * or deltaX must be provided, but not both.
 * @property {string[]|string} modifierKeys List of possible keys or a single key name to
 * depress while the scroll is being performed. Supported key names are: Shift, Ctrl, Alt, Win.
 * For example, in order to keep Ctrl+Alt depressed while clicking, provide the value of
 * ['ctrl', 'alt']
 */

/**
 * Performs horizontal or vertical scrolling with mouse wheel.
 *
 * @param {ScrollOptions} opts
 * @throws {Error} If given options are not acceptable or the gesture has failed.
 */
commands.windowsScroll = async function windowsScroll (opts = {}) {
  const {
    elementId,
    x, y,
    deltaX, deltaY,
    modifierKeys,
  } = opts;

  const [modifierKeyDownInputs, modifierKeyUpInputs] = modifierKeysToInputs.bind(this)(modifierKeys);
  const [absoluteX, absoluteY] = await toAbsoluteCoordinates.bind(this)(elementId, x, y);
  let moveInput;
  let scrollInput;
  try {
    moveInput = await toMouseMoveInput({x: absoluteX, y: absoluteY});
    scrollInput = toMouseWheelInput({dx: deltaX, dy: deltaY});
  } catch (e) {
    throw preprocessError(e);
  }
  try {
    if (!_.isEmpty(modifierKeyDownInputs)) {
      await handleInputs(modifierKeyDownInputs);
    }
    await handleInputs(moveInput);
    if (scrollInput) {
      await handleInputs(scrollInput);
    } else {
      this.log.info('There is no need to actually perform scroll with the given ' +
        (_.isNil(deltaX) ? 'deltaY' : 'deltaX'));
    }
  } finally {
    if (!_.isEmpty(modifierKeyUpInputs)) {
      await handleInputs(modifierKeyUpInputs);
    }
  }
};

export { commands };
export default commands;
