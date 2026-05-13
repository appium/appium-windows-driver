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
  type MouseInput,
  type KeyInput,
} from './winapi/user32';
import {errors} from 'appium/driver';
import {sleep, asyncmap} from 'asyncbox';
import {util} from 'appium/support';
import type {WindowsDriver} from '../driver';
import {isInvalidArgumentError} from './winapi/errors';

const EVENT_INJECTION_DELAY_MS = 5;

type MouseButtonName = (typeof MOUSE_BUTTON)[keyof typeof MOUSE_BUTTON];

/** One key action for {@link windowsKeys}; only one of `pause`, `text`, or `virtualKeyCode` should be set. */
interface KeyAction {
  pause?: number;
  text?: string;
  virtualKeyCode?: number;
  /** With `virtualKeyCode`, set to depress (`true`) or release (`false`) instead of a full keypress. */
  down?: boolean;
}

function preprocessError(e: unknown): unknown {
  if (!isInvalidArgumentError(e)) {
    return e;
  }

  const err = new errors.InvalidArgumentError(e.message);
  err.stack = e.stack;
  return err;
}

function modifierKeysToInputs(this: WindowsDriver, modifierKeys?: string | string[]) {
  if (_.isEmpty(modifierKeys)) {
    return [[], []] as [KeyInput[], KeyInput[]];
  }

  const modifierKeyDownInputs: KeyInput[] = [];
  const modifierKeyUpInputs: KeyInput[] = [];
  const keys = modifierKeys as string | string[];
  let parsedDownInputs: KeyInput[];
  try {
    parsedDownInputs = toModifierInputs(keys, KEY_ACTION.DOWN);
  } catch (e) {
    throw preprocessError(e);
  }
  this.log.debug(`Parsed ${util.pluralize('modifier key input', parsedDownInputs.length, true)}`);
  modifierKeyDownInputs.push(...parsedDownInputs);
  // depressing keys in the reversed order
  modifierKeyUpInputs.push(...toModifierInputs(keys, KEY_ACTION.UP));
  _.reverse(modifierKeyUpInputs);
  return [modifierKeyDownInputs, modifierKeyUpInputs];
}

async function toAbsoluteCoordinates(
  this: WindowsDriver,
  elementId?: string,
  x?: number,
  y?: number,
  msgPrefix = '',
): Promise<[number, number]> {
  const hasX = _.isInteger(x);
  const hasY = _.isInteger(y);
  if (msgPrefix) {
    msgPrefix += ': ';
  }

  if (!elementId && !hasX && !hasY) {
    throw new errors.InvalidArgumentError(
      `${msgPrefix}Either element identifier or absolute coordinates must be provided`,
    );
  }

  if (!elementId) {
    if (!hasX || !hasY) {
      throw new errors.InvalidArgumentError(
        `${msgPrefix}Both absolute coordinates must be provided`,
      );
    }
    this.log.debug(`${msgPrefix}Absolute coordinates: (${x}, ${y})`);
    return [x as number, y as number];
  }

  if ((hasX && !hasY) || (!hasX && hasY)) {
    throw new errors.InvalidArgumentError(
      `${msgPrefix}Both relative element coordinates must be provided`,
    );
  }

  let absoluteX = x;
  let absoluteY = y;
  const {x: left, y: top} = await this.winAppDriver.sendCommand(
    `/element/${elementId}/location`,
    'GET',
  );
  if (!hasX && !hasY) {
    const {width, height} = await this.winAppDriver.sendCommand(
      `/element/${elementId}/size`,
      'GET',
    );
    absoluteX = left + Math.trunc(width / 2);
    absoluteY = top + Math.trunc(height / 2);
  } else {
    // coordinates relative to the element's left top corner have been provided
    absoluteX += left;
    absoluteY += top;
  }
  this.log.debug(`${msgPrefix}Absolute coordinates: (${absoluteX}, ${absoluteY})`);
  return [absoluteX as number, absoluteY as number];
}

function isModifierKeyName(name: string): name is keyof typeof MODIFIER_KEY {
  return name in MODIFIER_KEY;
}

function isKeyDown(action: string): boolean {
  switch (_.toLower(action)) {
    case KEY_ACTION.UP:
      return false;
    case KEY_ACTION.DOWN:
      return true;
    default:
      throw new errors.InvalidArgumentError(
        `Key action '${action}' is unknown. Only ${_.values(KEY_ACTION)} actions are supported`,
      );
  }
}

function toModifierInputs(modifierKeys: string | string[], action: string): KeyInput[] {
  const events: Array<{virtualKeyCode: number; action: string}> = [];
  const usedKeys = new Set();
  for (const keyName of _.isArray(modifierKeys) ? modifierKeys : [modifierKeys]) {
    const lowerKeyName = _.toLower(keyName);
    if (usedKeys.has(lowerKeyName)) {
      continue;
    }

    if (!isModifierKeyName(lowerKeyName)) {
      throw new errors.InvalidArgumentError(
        `Modifier key name '${keyName}' is unknown. Supported key names are: ${_.keys(MODIFIER_KEY)}`,
      );
    }
    const virtualKeyCode = MODIFIER_KEY[lowerKeyName];
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

const KEY_ACTION_PROPERTIES = ['pause', 'text', 'virtualKeyCode'];

/**
 * Performs single click mouse gesture.
 *
 * @param elementId Hexadecimal identifier of the element to click on.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @param x Integer horizontal coordinate of the click point. Both x and y coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param y Integer vertical coordinate of the click point. Both x and y coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param button Name of
 * the mouse button to be clicked. An exception is thrown if an unknown button name
 * is provided.
 * @param modifierKeys List of possible keys or a single key name to
 * depress while the click is being performed. Supported key names are: Shift, Ctrl, Alt, Win.
 * For example, in order to keep Ctrl+Alt depressed while clicking, provide the value of
 * ['ctrl', 'alt']
 * @param durationMs The number of milliseconds to wait between pressing
 * and releasing the mouse button. By default no delay is applied, which simulates a
 * regular click.
 * @param times How many times the click must be performed.
 * @param interClickDelayMs Duration od the pause between each
 * click gesture. Only makes sense if `times` is greater than one.
 * @throws If given options are not acceptable or the gesture has failed.
 */
export async function windowsClick(
  this: WindowsDriver,
  elementId?: string,
  x?: number,
  y?: number,
  button: MouseButtonName = MOUSE_BUTTON.LEFT,
  modifierKeys?: string | string[],
  durationMs?: number,
  times = 1,
  interClickDelayMs = 100,
): Promise<void> {
  await ensureDpiAwareness.bind(this)();

  const [modifierKeyDownInputs, modifierKeyUpInputs] = modifierKeysToInputs.bind(this)(
    modifierKeys,
  ) as [KeyInput[], KeyInput[]];
  const [absoluteX, absoluteY] = (await toAbsoluteCoordinates.bind(this)(elementId, x, y)) as [
    number,
    number,
  ];
  let clickDownInput: MouseInput;
  let clickUpInput: MouseInput;
  let clickInput: MouseInput;
  let moveInput: MouseInput;
  try {
    [clickDownInput, clickUpInput, clickInput, moveInput] = await Promise.all([
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
    const hasDuration = _.isInteger(durationMs) && (durationMs as number) > 0;
    const hasInterClickDelay = _.isInteger(interClickDelayMs) && interClickDelayMs > 0;
    for (let i = 0; i < times; ++i) {
      if (hasDuration) {
        await handleInputs(clickDownInput);
        await sleep(durationMs as number);
        await handleInputs(clickUpInput);
      } else {
        await handleInputs(clickInput);
      }
      if (hasInterClickDelay) {
        await sleep(interClickDelayMs);
      }
    }
  } finally {
    if (!_.isEmpty(modifierKeyUpInputs)) {
      await handleInputs(modifierKeyUpInputs);
    }
  }
}

/**
 * Performs horizontal or vertical scrolling with mouse wheel.
 *
 * @param elementId Hexadecimal identifier of the element to scroll.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @param x Integer horizontal coordinate of the scroll point. Both x and y coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param y Integer vertical coordinate of the scroll point. Both x and y coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param deltaX Integer horizontal scroll delta. Either this value
 * or deltaY must be provided, but not both.
 * @param deltaY Integer vertical scroll delta. Either this value
 * or deltaX must be provided, but not both.
 * @param modifierKeys List of possible keys or a single key name to
 * depress while the scroll is being performed. Supported key names are: Shift, Ctrl, Alt, Win.
 * For example, in order to keep Ctrl+Alt depressed while clicking, provide the value of
 * ['ctrl', 'alt']
 * @throws If given options are not acceptable or the gesture has failed.
 */
export async function windowsScroll(
  this: WindowsDriver,
  elementId?: string,
  x?: number,
  y?: number,
  deltaX?: number,
  deltaY?: number,
  modifierKeys?: string | string[],
): Promise<void> {
  await ensureDpiAwareness.bind(this)();

  const [modifierKeyDownInputs, modifierKeyUpInputs] = modifierKeysToInputs.bind(this)(
    modifierKeys,
  ) as [KeyInput[], KeyInput[]];
  const [absoluteX, absoluteY] = (await toAbsoluteCoordinates.bind(this)(elementId, x, y)) as [
    number,
    number,
  ];
  let moveInput: MouseInput;
  let scrollInput: MouseInput | null;
  try {
    moveInput = await toMouseMoveInput(absoluteX, absoluteY);
    scrollInput = toMouseWheelInput(deltaX, deltaY);
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
      this.log.info(
        'There is no need to actually perform scroll with the given ' +
          (_.isNil(deltaX) ? 'deltaY' : 'deltaX'),
      );
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
 * @param startElementId Hexadecimal identifier of the element to start the drag from.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @param startX Integer horizontal coordinate of the drag start point. Both startX
 * and startY coordinates must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param startY Integer vertical coordinate of the drag start point. Both startX and
 * startY coordinates must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param endElementId Hexadecimal identifier of the element to end the drag on.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @param endX Integer horizontal coordinate of the drag end point. Both endX and endY coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param endY Integer vertical coordinate of the drag end point. Both endX and endY coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param modifierKeys List of possible keys or a single key name to
 * depress while the drag is being performed. Supported key names are: Shift, Ctrl, Alt, Win.
 * For example, in order to keep Ctrl+Alt depressed while clicking, provide the value of
 * ['ctrl', 'alt']
 * @param durationMs The number of milliseconds to wait between pressing
 * the left mouse button and moving the cursor to the ending drag point.
 * @throws If given options are not acceptable or the gesture has failed.
 */
export async function windowsClickAndDrag(
  this: WindowsDriver,
  startElementId?: string,
  startX?: number,
  startY?: number,
  endElementId?: string,
  endX?: number,
  endY?: number,
  modifierKeys?: string | string[],
  durationMs = 5000,
): Promise<void> {
  await ensureDpiAwareness.bind(this)();

  const screenSize = await getVirtualScreenSize();
  const [modifierKeyDownInputs, modifierKeyUpInputs] = modifierKeysToInputs.bind(this)(
    modifierKeys,
  ) as [KeyInput[], KeyInput[]];
  const [[startAbsoluteX, startAbsoluteY], [endAbsoluteX, endAbsoluteY]] = await Promise.all([
    toAbsoluteCoordinates.bind(this)(
      startElementId,
      startX,
      startY,
      'Starting drag point',
    ) as Promise<[number, number]>,
    toAbsoluteCoordinates.bind(this)(endElementId, endX, endY, 'Ending drag point') as Promise<
      [number, number]
    >,
  ]);
  let clickDownInput: MouseInput;
  let clickUpInput: MouseInput;
  let moveStartInput: MouseInput;
  let moveEndInput: MouseInput;
  try {
    [moveStartInput, clickDownInput, moveEndInput, clickUpInput] = await Promise.all([
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
    await sleep(10);
    await handleInputs(clickDownInput);
    await sleep(durationMs);
    await handleInputs(moveEndInput);
    await sleep(10);
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
 * @param startElementId Hexadecimal identifier of the element to start the hover from.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @param startX Integer horizontal coordinate of the hover start point. Both startX
 * and startY coordinates must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param startY Integer vertical coordinate of the hover start point. Both startX and
 * startY coordinates must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param endElementId Hexadecimal identifier of the element to end the hover on.
 * If this parameter is missing then given coordinates will be parsed as absolute ones.
 * Otherwise they are parsed as relative to the top left corner of this element.
 * @param endX Integer horizontal coordinate of the hover end point. Both endX and endY coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param endY Integer vertical coordinate of the hover end point. Both endX and endY coordinates
 * must be provided or none of them if elementId is present. In such case the gesture
 * will be performed at the center point of the given element.
 * @param modifierKeys List of possible keys or a single key name to
 * depress while the hover is being performed. Supported key names are: Shift, Ctrl, Alt, Win.
 * For example, in order to keep Ctrl+Alt depressed while hovering, provide the value of
 * ['ctrl', 'alt']
 * @param durationMs The number of milliseconds between
 * moving the cursor from the starting to the ending hover point.
 * @throws If given options are not acceptable or the gesture has failed.
 */
export async function windowsHover(
  this: WindowsDriver,
  startElementId?: string,
  startX?: number,
  startY?: number,
  endElementId?: string,
  endX?: number,
  endY?: number,
  modifierKeys?: string | string[],
  durationMs = 500,
): Promise<void> {
  await ensureDpiAwareness.bind(this)();

  const screenSize = await getVirtualScreenSize();
  const [modifierKeyDownInputs, modifierKeyUpInputs] = modifierKeysToInputs.bind(this)(
    modifierKeys,
  ) as [KeyInput[], KeyInput[]];
  const [[startAbsoluteX, startAbsoluteY], [endAbsoluteX, endAbsoluteY]] = await Promise.all([
    toAbsoluteCoordinates.bind(this)(
      startElementId,
      startX,
      startY,
      'Starting hover point',
    ) as Promise<[number, number]>,
    toAbsoluteCoordinates.bind(this)(endElementId, endX, endY, 'Ending hover point') as Promise<
      [number, number]
    >,
  ]);
  const stepsCount = Math.max(Math.trunc(durationMs / EVENT_INJECTION_DELAY_MS), 1);
  const maxChunkSize = 10;
  const steps = _.range(0, stepsCount + 1);
  let inputs: MouseInput[];
  try {
    inputs = await asyncmap(
      steps,
      async (step) =>
        toMouseMoveInput(
          startAbsoluteX + Math.trunc(((endAbsoluteX - startAbsoluteX) * step) / stepsCount),
          startAbsoluteY + Math.trunc(((endAbsoluteY - startAbsoluteY) * step) / stepsCount),
          screenSize,
        ),
      {concurrency: maxChunkSize},
    );
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
        await sleep(EVENT_INJECTION_DELAY_MS);
      }
    }
  } finally {
    if (!_.isEmpty(modifierKeyUpInputs)) {
      await handleInputs(modifierKeyUpInputs);
    }
  }
}

/**
 * Performs customized keyboard input.
 *
 * @param actions - One or more key actions.
 * @throws If given options are not acceptable or the gesture has failed.
 */
export async function windowsKeys(
  this: WindowsDriver,
  actions: KeyAction | KeyAction[],
): Promise<void> {
  const parsedItems = parseKeyActions(_.isArray(actions) ? actions : [actions]);
  this.log.debug(`Parsed ${util.pluralize('key action', parsedItems.length, true)}`);
  for (const item of parsedItems) {
    if (_.isArray(item)) {
      await handleInputs(item);
    } else {
      await sleep(item);
    }
  }
}

function parseKeyAction(action: KeyAction, index: number): number | KeyInput[] {
  const hasPause = _.has(action, 'pause');
  const hasText = _.has(action, 'text');
  const hasVirtualKeyCode = _.has(action, 'virtualKeyCode');
  const definedPropertiesCount = Number(hasPause) + Number(hasText) + Number(hasVirtualKeyCode);
  const actionPrefix = `Key Action #${index + 1} (${JSON.stringify(action)}): `;
  if (definedPropertiesCount === 0) {
    throw new errors.InvalidArgumentError(
      `${actionPrefix}Some key action (${KEY_ACTION_PROPERTIES.join(' or ')}) must be defined`,
    );
  } else if (definedPropertiesCount > 1) {
    throw new errors.InvalidArgumentError(
      `${actionPrefix}Only one key action (${KEY_ACTION_PROPERTIES.join(' or ')}) must be defined`,
    );
  }

  const {pause, text, virtualKeyCode, down} = action;

  if (hasPause) {
    const durationMs = pause as number;
    if (!_.isInteger(durationMs) || durationMs < 0) {
      throw new errors.InvalidArgumentError(
        `${actionPrefix}Pause value must be a valid positive integer number of milliseconds`,
      );
    }
    return durationMs;
  }
  if (hasText) {
    if (!_.isString(text) || _.isEmpty(text)) {
      throw new errors.InvalidArgumentError(
        `${actionPrefix}Text value must be a valid non-empty string`,
      );
    }
    return toUnicodeKeyInputs(text);
  }

  // has virtual code
  if (_.has(action, 'down')) {
    if (!_.isBoolean(down)) {
      throw new errors.InvalidArgumentError(
        `${actionPrefix}The down argument must be of type boolean if provided`,
      );
    }

    // only depress or release the key if `down` is provided
    return [
      createKeyInput({
        wVk: virtualKeyCode,
        dwFlags: down ? 0 : KEYEVENTF_KEYUP,
      }),
    ];
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

function parseKeyActions(actions: KeyAction[]): Array<number | KeyInput[]> {
  if (_.isEmpty(actions)) {
    throw new errors.InvalidArgumentError('Key actions must not be empty');
  }

  const combinedArray: Array<number | KeyInput[]> = [];
  const allActions = actions.map(parseKeyAction);
  for (let i = 0; i < allActions.length; ++i) {
    const item = allActions[i];
    const last = _.last(combinedArray);
    if (_.isArray(item) && combinedArray.length > 0 && last !== undefined && _.isArray(last)) {
      last.push(...item);
    } else {
      combinedArray.push(item);
    }
  }
  // The resulting array contains all keyboard inputs combined into a single array
  // unless there are pauses that act as splitters
  return combinedArray;
}

async function ensureDpiAwareness(this: WindowsDriver): Promise<void> {
  if (!(await _ensureDpiAwareness())) {
    this.log.info(
      `The call to SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) API has failed. ` +
        `Mouse cursor coordinates calculation for scaled displays might not work as expected.`,
    );
  }
}
