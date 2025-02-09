import _ from 'lodash';
import {
  MOUSE_BUTTON_ACTION,
  MOUSE_BUTTON,
  KEY_ACTION,
  MODIFIER_KEY,
  KEYEVENTF_KEYUP,
  createKeyInput,
  toUnicodeKeyInputs,
  handleInputs,
  toMouseButtonInput,
  toMouseMoveInput,
  toMouseWheelInput,
  getVirtualScreenSize,
  ensureDpiAwareness as _ensureDpiAwareness,
} from './winapi/user32';
import { errors } from 'appium/driver';
import B from 'bluebird';
import { util } from 'appium/support';
import { isInvalidArgumentError } from './winapi/errors';

const EVENT_INJECTION_DELAY_MS = 5;


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

async function toAbsoluteCoordinates(elementId, x, y, msgPrefix = '') {
  const hasX = _.isInteger(x);
  const hasY = _.isInteger(y);
  if (msgPrefix) {
    msgPrefix += ': ';
  }

  if (!elementId && !hasX && !hasY) {
    throw new errors.InvalidArgumentError(
      `${msgPrefix}Either element identifier or absolute coordinates must be provided`
    );
  }

  if (!elementId) {
    if (!hasX || !hasY) {
      throw new errors.InvalidArgumentError(
        `${msgPrefix}Both absolute coordinates must be provided`
      );
    }
    this.log.debug(`${msgPrefix}Absolute coordinates: (${x}, ${y})`);
    return [x, y];
  }

  if (hasX && !hasY || !hasX && hasY) {
    throw new errors.InvalidArgumentError(
      `${msgPrefix}Both relative element coordinates must be provided`
    );
  }

  let absoluteX = x;
  let absoluteY = y;
  const {x: left, y: top} = await this.winAppDriver.sendCommand(`/element/${elementId}/location`, 'GET');
  if (!hasX && !hasY) {
    const {width, height} = await this.winAppDriver.sendCommand(`/element/${elementId}/size`, 'GET');
    absoluteX = left + Math.trunc(width / 2);
    absoluteY = top + Math.trunc(height / 2);
  } else {
    // coordinates relative to the element's left top corner have been provided
    absoluteX += left;
    absoluteY += top;
  }
  this.log.debug(`${msgPrefix}Absolute coordinates: (${absoluteX}, ${absoluteY})`);
  return [absoluteX, absoluteY];
}

function isKeyDown(action) {
  switch (_.toLower(action)) {
    case KEY_ACTION.UP:
      return false;
    case KEY_ACTION.DOWN:
      return true;
    default:
      throw new errors.InvalidArgumentError(
        `Key action '${action}' is unknown. Only ${_.values(KEY_ACTION)} actions are supported`
      );
  }
}

/**
 * Transforms the provided key modifiers array into the sequence
 * of functional key inputs.
 *
 * @param {string[]|string} modifierKeys Array of key modifiers or a single key name
 * @param {'down' | 'up'} action Either 'down' to depress the key or 'up' to release it
 * @returns {any[]} Array of inputs or an empty array if no inputs were parsed.
 */
function toModifierInputs(modifierKeys, action) {
  const events = [];
  const usedKeys = new Set();
  for (const keyName of (_.isArray(modifierKeys) ? modifierKeys : [modifierKeys])) {
    const lowerKeyName = _.toLower(keyName);
    if (usedKeys.has(lowerKeyName)) {
      continue;
    }

    const virtualKeyCode = MODIFIER_KEY[lowerKeyName];
    if (_.isUndefined(virtualKeyCode)) {
      throw new errors.InvalidArgumentError(
        `Modifier key name '${keyName}' is unknown. Supported key names are: ${_.keys(MODIFIER_KEY)}`
      );
    }
    events.push({virtualKeyCode, action});
    usedKeys.add(lowerKeyName);
  }
  return events
    .map(({virtualKeyCode, action}) => ({
      wVk: virtualKeyCode,
      dwFlags: isKeyDown(action) ? 0 : KEYEVENTF_KEYUP,
    }))
    .map(createKeyInput);
}

const KEY_ACTION_PROPERTIES = [
  'pause',
  'text',
  'virtualKeyCode',
];

/**
 * @param {KeyAction} action
 * @param {number} index
 * @returns {any[] | number}
 */
function parseKeyAction(action, index) {
  const hasPause = _.has(action, 'pause');
  const hasText = _.has(action, 'text');
  const hasVirtualKeyCode = _.has(action, 'virtualKeyCode');
  // @ts-ignore We rely on implcit conversion here
  const definedPropertiesCount = hasPause + hasText + hasVirtualKeyCode;
  const actionPrefix = `Key Action #${index + 1} (${JSON.stringify(action)}): `;
  if (definedPropertiesCount === 0) {
    throw new errors.InvalidArgumentError(
      `${actionPrefix}Some key action (${KEY_ACTION_PROPERTIES.join(' or ')}) must be defined`
    );
  } else if (definedPropertiesCount > 1) {
    throw new errors.InvalidArgumentError(
      `${actionPrefix}Only one key action (${KEY_ACTION_PROPERTIES.join(' or ')}) must be defined`
    );
  }

  const {
    pause,
    text,
    virtualKeyCode,
    down,
  } = action;

  if (hasPause) {
    const durationMs = pause;
    if (!_.isInteger(durationMs) || durationMs < 0) {
      throw new errors.InvalidArgumentError(
        `${actionPrefix}Pause value must be a valid positive integer number of milliseconds`
      );
    }
    return durationMs;
  }
  if (hasText) {
    if (!_.isString(text) || _.isEmpty(text)) {
      throw new errors.InvalidArgumentError(
        `${actionPrefix}Text value must be a valid non-empty string`
      );
    }
    return toUnicodeKeyInputs(text);
  }

  // has virtual code
  if (_.has(action, 'down')) {
    if (!_.isBoolean(down)) {
      throw new errors.InvalidArgumentError(
        `${actionPrefix}The down argument must be of type boolean if provided`
      );
    }

    // only depress or release the key if `down` is provided
    return [createKeyInput({
      wVk: virtualKeyCode,
      dwFlags: down ? 0 : KEYEVENTF_KEYUP,
    })];
  }
  // otherwise just press the key
  return [
    createKeyInput({
      wVk: virtualKeyCode,
      dwFlags: 0,
    }),
    createKeyInput({
      wVk: virtualKeyCode,
      dwFlags: KEYEVENTF_KEYUP,
    }),
  ];
}

/**
 * @param {KeyAction[]} actions
 * @returns {any[]}
 */
function parseKeyActions(actions) {
  if (_.isEmpty(actions)) {
    throw new errors.InvalidArgumentError('Key actions must not be empty');
  }

  const combinedArray = [];
  const allActions = actions.map(parseKeyAction);
  for (let i = 0; i < allActions.length; ++i) {
    const item = allActions[i];
    if (_.isArray(item) && combinedArray.length > 0 && _.isArray(_.last(combinedArray))) {
      // @ts-ignore TS does not understand the validation above
      _.last(combinedArray).push(...item);
    } else {
      combinedArray.push(item);
    }
  }
  // The resulting array contains all keyboard inputs combined into a single array
  // unless there are pauses that act as splitters
  return combinedArray;
}

/**
 * Performs single click mouse gesture.
 *
 * @this {WindowsDriver}
 * @param {string} [elementId] Hexadecimal identifier of the element to click on.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @param {number} [x] Integer horizontal coordinate of the click point. Both x and y coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param {number} [y] Integer vertical coordinate of the click point. Both x and y coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param {'left' | 'middle' | 'right' | 'back' | 'forward'} [button=left] Name of
 * the mouse button to be clicked. An exception is thrown if an unknown button name
 * is provided.
 * @param {string[]|string} [modifierKeys] List of possible keys or a single key name to
 * depress while the click is being performed. Supported key names are: Shift, Ctrl, Alt, Win.
 * For example, in order to keep Ctrl+Alt depressed while clicking, provide the value of
 * ['ctrl', 'alt']
 * @param {number} [durationMs] The number of milliseconds to wait between pressing
 * and releasing the mouse button. By default no delay is applied, which simulates a
 * regular click.
 * @param {number} [times=1] How many times the click must be performed.
 * @param {number} [interClickDelayMs=100] Duration od the pause between each
 * click gesture. Only makes sense if `times` is greater than one.
 * @throws {Error} If given options are not acceptable or the gesture has failed.
 */
export async function windowsClick (
  elementId,
  x,
  y,
  button = MOUSE_BUTTON.LEFT,
  modifierKeys,
  durationMs,
  times = 1,
  interClickDelayMs = 100,
) {
  await ensureDpiAwareness.bind(this)();

  const [modifierKeyDownInputs, modifierKeyUpInputs] = modifierKeysToInputs.bind(this)(modifierKeys);
  const [absoluteX, absoluteY] = await toAbsoluteCoordinates.bind(this)(elementId, x, y);
  let clickDownInput;
  let clickUpInput;
  let clickInput;
  let moveInput;
  try {
    [clickDownInput, clickUpInput, clickInput, moveInput] = await B.all([
      toMouseButtonInput({button, action: MOUSE_BUTTON_ACTION.DOWN}),
      toMouseButtonInput({button, action: MOUSE_BUTTON_ACTION.UP}),
      toMouseButtonInput({button, action: MOUSE_BUTTON_ACTION.CLICK}),
      toMouseMoveInput(absoluteX, absoluteY),
    ]);
  } catch (e) {
    throw preprocessError(e);
  }

  try {
    if (!_.isEmpty(modifierKeyDownInputs)) {
      await handleInputs(modifierKeyDownInputs);
    }
    await handleInputs(moveInput);
    const hasDuration = _.isInteger(durationMs) && /** @type {number} */ (durationMs) > 0;
    const hasInterClickDelay = _.isInteger(interClickDelayMs) && interClickDelayMs > 0;
    for (let i = 0; i < times; ++i) {
      if (hasDuration) {
        await handleInputs(clickDownInput);
        await B.delay(/** @type {number} */ (durationMs));
        await handleInputs(clickUpInput);
      } else {
        await handleInputs(clickInput);
      }
      if (hasInterClickDelay) {
        await B.delay(interClickDelayMs);
      }
    }
  } finally {
    if (!_.isEmpty(modifierKeyUpInputs)) {
      await handleInputs(modifierKeyUpInputs);
    }
  }
};

/**
 * Performs horizontal or vertical scrolling with mouse wheel.
 *
 * @this {WindowsDriver}
 * @param {string} [elementId] Hexadecimal identifier of the element to scroll.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @param {number} [x] Integer horizontal coordinate of the scroll point. Both x and y coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param {number} [y] Integer vertical coordinate of the scroll point. Both x and y coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param {number} [deltaX] Integer horizontal scroll delta. Either this value
 * or deltaY must be provided, but not both.
 * @param {number} [deltaY] Integer vertical scroll delta. Either this value
 * or deltaX must be provided, but not both.
 * @param {string[]|string} [modifierKeys] List of possible keys or a single key name to
 * depress while the scroll is being performed. Supported key names are: Shift, Ctrl, Alt, Win.
 * For example, in order to keep Ctrl+Alt depressed while clicking, provide the value of
 * ['ctrl', 'alt']
 * @throws {Error} If given options are not acceptable or the gesture has failed.
 */
export async function windowsScroll (
  elementId,
  x,
  y,
  deltaX,
  deltaY,
  modifierKeys,
) {
  await ensureDpiAwareness.bind(this)();

  const [modifierKeyDownInputs, modifierKeyUpInputs] = modifierKeysToInputs.bind(this)(modifierKeys);
  const [absoluteX, absoluteY] = await toAbsoluteCoordinates.bind(this)(elementId, x, y);
  let moveInput;
  let scrollInput;
  try {
    moveInput = await toMouseMoveInput(absoluteX, absoluteY);
    scrollInput = toMouseWheelInput(
      /** @type {number} */ (deltaX),
      /** @type {number} */ (deltaY),
    );
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
}

/**
 * Performs drag and drop mouse gesture.
 *
 * @this {WindowsDriver}
 * @param {string} [startElementId] Hexadecimal identifier of the element to start the drag from.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @param {number} [startX] Integer horizontal coordinate of the drag start point. Both startX
 * and startY coordinates must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param {number} [startY] Integer vertical coordinate of the drag start point. Both startX and
 * startY coordinates must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param {string} [endElementId] Hexadecimal identifier of the element to end the drag on.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @param {number} [endX] Integer horizontal coordinate of the drag end point. Both endX and endY coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param {number} [endY] Integer vertical coordinate of the drag end point. Both endX and endY coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param {string[]|string} [modifierKeys] List of possible keys or a single key name to
 * depress while the drag is being performed. Supported key names are: Shift, Ctrl, Alt, Win.
 * For example, in order to keep Ctrl+Alt depressed while clicking, provide the value of
 * ['ctrl', 'alt']
 * @param {number} [durationMs=5000] The number of milliseconds to wait between pressing
 * the left mouse button and moving the cursor to the ending drag point.
 * @throws {Error} If given options are not acceptable or the gesture has failed.
 */
export async function windowsClickAndDrag (
  startElementId,
  startX, startY,
  endElementId,
  endX, endY,
  modifierKeys,
  durationMs = 5000,
) {
  await ensureDpiAwareness.bind(this)();

  const screenSize = await getVirtualScreenSize();
  const [modifierKeyDownInputs, modifierKeyUpInputs] = modifierKeysToInputs.bind(this)(modifierKeys);
  const [[startAbsoluteX, startAbsoluteY], [endAbsoluteX, endAbsoluteY]] = await B.all([
    toAbsoluteCoordinates.bind(this)(startElementId, startX, startY, 'Starting drag point'),
    toAbsoluteCoordinates.bind(this)(endElementId, endX, endY, 'Ending drag point'),
  ]);
  let clickDownInput;
  let clickUpInput;
  let moveStartInput;
  let moveEndInput;
  try {
    [moveStartInput, clickDownInput, moveEndInput, clickUpInput] = await B.all([
      toMouseMoveInput(startAbsoluteX, startAbsoluteY, screenSize),
      toMouseButtonInput({button: MOUSE_BUTTON.LEFT, action: MOUSE_BUTTON_ACTION.DOWN}),
      toMouseMoveInput(endAbsoluteX, endAbsoluteY, screenSize),
      toMouseButtonInput({button: MOUSE_BUTTON.LEFT, action: MOUSE_BUTTON_ACTION.UP}),
    ]);
  } catch (e) {
    throw preprocessError(e);
  }

  try {
    if (!_.isEmpty(modifierKeyDownInputs)) {
      await handleInputs(modifierKeyDownInputs);
    }
    await handleInputs(moveStartInput);
    // Small delays are necessary for the gesture to be registered as a valid drag-drop
    await B.delay(10);
    await handleInputs(clickDownInput);
    await B.delay(durationMs);
    await handleInputs(moveEndInput);
    await B.delay(10);
    await handleInputs(clickUpInput);
  } finally {
    if (!_.isEmpty(modifierKeyUpInputs)) {
      await handleInputs(modifierKeyUpInputs);
    }
  }
}

/**
 * Performs hover mouse gesture.
 *
 * @this {WindowsDriver}
 * @param {string} [startElementId] Hexadecimal identifier of the element to start the hover from.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @param {number} [startX] Integer horizontal coordinate of the hover start point. Both startX
 * and startY coordinates must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param {number} [startY] Integer vertical coordinate of the hover start point. Both startX and
 * startY coordinates must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param {string} [endElementId] Hexadecimal identifier of the element to end the hover on.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @param {number} [endX] Integer horizontal coordinate of the hover end point. Both endX and endY coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param {number} [endY] Integer vertical coordinate of the hover end point. Both endX and endY coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param {string[]|string} [modifierKeys] List of possible keys or a single key name to
 * depress while the hover is being performed. Supported key names are: Shift, Ctrl, Alt, Win.
 * For example, in order to keep Ctrl+Alt depressed while hovering, provide the value of
 * ['ctrl', 'alt']
 * @param {number} [durationMs=500] The number of milliseconds between
 * moving the cursor from the starting to the ending hover point.
 * @throws {Error} If given options are not acceptable or the gesture has failed.
 */
export async function windowsHover (
  startElementId,
  startX, startY,
  endElementId,
  endX, endY,
  modifierKeys,
  durationMs = 500,
) {
  await ensureDpiAwareness.bind(this)();

  const screenSize = await getVirtualScreenSize();
  const [modifierKeyDownInputs, modifierKeyUpInputs] = modifierKeysToInputs.bind(this)(modifierKeys);
  const [[startAbsoluteX, startAbsoluteY], [endAbsoluteX, endAbsoluteY]] = await B.all([
    toAbsoluteCoordinates.bind(this)(startElementId, startX, startY, 'Starting hover point'),
    toAbsoluteCoordinates.bind(this)(endElementId, endX, endY, 'Ending hover point'),
  ]);
  const stepsCount = Math.max(Math.trunc(durationMs / EVENT_INJECTION_DELAY_MS), 1);
  const inputPromises = [];
  const inputPromisesChunk = [];
  const maxChunkSize = 10;
  for (let step = 0; step <= stepsCount; ++step) {
    const promise = B.resolve(toMouseMoveInput(
      startAbsoluteX + Math.trunc((endAbsoluteX - startAbsoluteX) * step / stepsCount),
      startAbsoluteY + Math.trunc((endAbsoluteY - startAbsoluteY) * step / stepsCount),
      screenSize
    ));
    inputPromises.push(promise);
    // This is needed to avoid 'Error: Too many asynchronous calls are running'
    inputPromisesChunk.push(promise);
    if (inputPromisesChunk.length >= maxChunkSize) {
      await B.any(inputPromisesChunk);
      _.remove(inputPromisesChunk, (p) => p.isFulfilled());
    }
  }
  let inputs;
  try {
    inputs = await B.all(inputPromises);
  } catch (e) {
    throw preprocessError(e);
  }

  try {
    if (!_.isEmpty(modifierKeyDownInputs)) {
      await handleInputs(modifierKeyDownInputs);
    }
    for (let i = 0; i < inputs.length; ++i) {
      await handleInputs(inputs[i]);
      if (i < inputs.length - 1) {
        await B.delay(EVENT_INJECTION_DELAY_MS);
      }
    }
  } finally {
    if (!_.isEmpty(modifierKeyUpInputs)) {
      await handleInputs(modifierKeyUpInputs);
    }
  }
}

/**
 * @typedef {Object} KeyAction
 * @property {number} pause Allows to set a delay in milliseconds between key input series.
 * Either this property or `text` or `virtualKeyCode` must be provided.
 * @property {string} text Non-empty string of Unicode text to type.
 * Either this property or `pause` or `virtualKeyCode` must be provided.
 * @property {number} virtualKeyCode Valid virtual key code. The list of supported key codes
 * is available at https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes
 * Either this property or `pause` or `text` must be provided.
 * @property {boolean?} down [undefined] This property only makes sense in combination with `virtualKeyCode`.
 * If set to `true` then the corresponding key will be depressed, `false` - released. By default
 * the key is just pressed once.
 * ! Do not forget to release depressed keys in your automated tests.
 */

/**
 * Performs customized keyboard input.
 *
 * @this {WindowsDriver}
 * @param {KeyAction[] | KeyAction} actions One or more key actions.
 * @throws {Error} If given options are not acceptable or the gesture has failed.
 */
export async function windowsKeys (actions) {
  const parsedItems = parseKeyActions(_.isArray(actions) ? actions : [actions]);
  this.log.debug(`Parsed ${util.pluralize('key action', parsedItems.length, true)}`);
  for (const item of parsedItems) {
    if (_.isArray(item)) {
      await handleInputs(item);
    } else {
      await B.delay(item);
    }
  }
}

/**
 * @this {WindowsDriver}
 * @returns {Promise<void>}
 */
async function ensureDpiAwareness() {
  if (!await _ensureDpiAwareness()) {
    this.log.info(
      `The call to SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) API has failed. ` +
      `Mouse cursor coordinates calculation for scaled displays might not work as expected.`
    );
  }
}

/**
 * @typedef {import('../driver').WindowsDriver} WindowsDriver
 */
