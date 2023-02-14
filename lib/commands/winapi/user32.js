import _ from 'lodash';
import ffi from 'ffi-napi';
// import ref from 'ref-napi';
import os from 'os';
import StructType from 'ref-struct-napi';
import UnionType from 'ref-union-napi';
import ArrayType from 'ref-array-napi';
import B from 'bluebird';
import { getLastError } from './kernel32';

// Mostly ported from
// https://chromium.googlesource.com/chromium/src/+/refs/heads/main/remoting/host/input_injector_win.cc

const user32 = new ffi.Library('user32.dll', {
  // UINT SendInput(
  //   _In_ UINT cInputs,                     // number of input in the array
  //   _In_reads_(cInputs) LPINPUT pInputs,  // array of inputs
  //   _In_ int cbSize);                      // sizeof(INPUT)
  'SendInput': ['uint32', ['int32', 'pointer', 'int32']],
  // int GetSystemMetrics(
  //  [in] int nIndex
  // );
  'GetSystemMetrics': ['int', ['int']],
});

// typedef struct tagMOUSEINPUT {
//   LONG    dx;
//   LONG    dy;
//   DWORD   mouseData;
//   DWORD   dwFlags;
//   DWORD   time;
//   ULONG_PTR dwExtraInfo;
// } MOUSEINPUT;
const MOUSEINPUT = StructType({
  dx: 'int32',
  dy: 'int32',
  mouseData: 'uint32',
  dwFlags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'pointer',
});

// typedef struct tagKEYBDINPUT {
//   WORD    wVk;
//   WORD    wScan;
//   DWORD   dwFlags;
//   DWORD   time;
//   ULONG_PTR dwExtraInfo;
// } KEYBDINPUT;
const KEYBDINPUT = StructType({
  wVK: 'uint16',
  wScan: 'uint16',
  dwFlags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'pointer',
});

// typedef struct tagHARDWAREINPUT {
//   DWORD   uMsg;
//   WORD    wParamL;
//   WORD    wParamH;
// } HARDWAREINPUT;
const HARDWAREINPUT = StructType({
  uMsg: 'uint32',
  wParamL: 'uint16',
  wParamH: 'uint16',
});

// typedef struct tagINPUT {
//   DWORD   type;
//   union
//   {
//     MOUSEINPUT      mi;
//     KEYBDINPUT      ki;
//     HARDWAREINPUT   hi;
//   } DUMMYUNIONNAME;
// } INPUT;
const INPUT_UNION = UnionType({
  mi: MOUSEINPUT,
  ki: KEYBDINPUT,
  hi: HARDWAREINPUT,
});
const INPUT = StructType({
  type: 'uint32',
  union: INPUT_UNION,
});
const INPUTS_ARRAY = ArrayType(INPUT);
const INPUT_STRUCT_SIZE = os.arch() === 'x64' ? 40 : 28;

const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 0x0002;
export const KEY_ACTION = Object.freeze({
  UP: 'up',
  DOWN: 'down',
});

const VK_SHIFT = 0x10;
export const KEY_MODIFIER_SHIFT = 1 << 1;
const VK_CONTROL = 0x11;
export const KEY_MODIFIER_CONTROL = 1 << 2;
const VK_LWIN = 0x5B;
export const KEY_MODIFIER_WIN = 1 << 4;
const VK_ALT = 0x12;
export const KEY_MODIFIER_ALT = 1 << 3;

const INPUT_MOUSE = 0;
const SM_SWAPBUTTON = 23;
export const MOUSE_BUTTON = Object.freeze({
  LEFT: 'left',
  MIDDLE: 'middle',
  RIGHT: 'right',
  BACK: 'back',
  FORWARD: 'forward',
});
export const MOUSE_BUTTON_ACTION = Object.freeze({
  UP: 'up',
  DOWN: 'down',
});
const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_XDOWN = 0x0080;
const MOUSEEVENTF_XUP = 0x0100;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_HWHEEL = 0x1000;
const MOUSEEVENTF_VIRTUALDESK = 0x4000;
const MOUSEEVENTF_ABSOLUTE = 0x8000;
const XBUTTON1 = 0x0001;
const XBUTTON2 = 0x0002;
const SM_CXVIRTUALSCREEN = 78;
const SM_CYVIRTUALSCREEN = 79;
const MOUSE_MOVE_NORM = 0xFFFF;


async function sendInputs (inputs, many = true) {
  const inputsCount = many ? inputs.length : 1;
  const uSent = await new B((resolve, reject) => {
    // eslint-disable-next-line promise/prefer-await-to-callbacks
    user32.SendInput.async(inputsCount, inputs, INPUT_STRUCT_SIZE,
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
  if (uSent !== inputsCount) {
    throw new Error(`SendInput API call failed with error code ${await getLastError()}`);
  }
}

function toKeyInput({virtualKeyCode, action}) {
  let down = true;
  switch (_.toLower(action)) {
    case KEY_ACTION.UP:
      down = false;
      break;
    case KEY_ACTION.DOWN:
      break;
    default:
      throw new Error(`Key action '${action}' is unknown. ` +
        `Only ${_.values(KEY_ACTION)} actions are supported`);
  }

  const keyInput = new INPUT();
  keyInput.type = INPUT_KEYBOARD;
  keyInput.ki.time = 0;
  keyInput.ki.dwExtraInfo = 0;
  keyInput.ki.dwFlags = down ? 0 : KEYEVENTF_KEYUP;
  keyInput.ki.wVK = virtualKeyCode;
  keyInput.ki.wScan = 0;
  return keyInput;
}

/**
 * Sends the provided input structures to SendInput WinAPI
 *
 * @param {INPUT|INPUT[]} inputs single INPUT structure or
 * an array of input structures,
 * @throws {Error} If any of the given inputs has not been successfully executed.
 */
export async function handleInputs(inputs) {
  const hasArray = _.isArray(inputs);
  if (hasArray && inputs.length > 1) {
    const inputsArr = new INPUTS_ARRAY(inputs.length);
    for (let i = 0; i < inputs.length; ++i) {
      inputsArr[i] = inputs[i];
    }
    return await sendInputs(inputsArr, true);
  }
  if (hasArray && inputs.length === 1 || !hasArray) {
    return await sendInputs(hasArray ? inputs[0] : inputs, false);
  }
  throw new Error('At least one input must be provided');
}

/**
 * Transforms the provided modifiers binary mask into the sequence
 * of functional key inputs.
 *
 * @param {number} modifiers An integer mask for key modifiers
 * @param {'down' | 'up'} action Either 'down' to depress the key or 'up' to release it
 * @returns {INPUT[]} Array of inputs or an empty array if no inputs were parsed.
 */
export function toModifierInputs(modifiers, action) {
  const events = [];
  if (modifiers & KEY_MODIFIER_SHIFT) {
    events.push({
      virtualKeyCode: VK_SHIFT,
      action,
    });
  }
  if (modifiers & KEY_MODIFIER_ALT) {
    events.push({
      virtualKeyCode: VK_ALT,
      action,
    });
  }
  if (modifiers & KEY_MODIFIER_CONTROL) {
    events.push({
      virtualKeyCode: VK_CONTROL,
      action,
    });
  }
  if (modifiers & KEY_MODIFIER_WIN) {
    events.push({
      virtualKeyCode: VK_LWIN,
      action,
    });
  }
  return events.map(toKeyInput);
}

async function getSystemMetrics(nIndex) {
  return await new B((resolve, reject) =>
    // eslint-disable-next-line promise/prefer-await-to-callbacks
    user32.GetSystemMetrics.async(nIndex, (error, result) => error ? reject(error) : resolve(result))
  );
}

function createDefaultMouseInput () {
  const input = new INPUT();
  input.type = INPUT_MOUSE;
  input.mi.time = 0;
  input.mi.dwExtraInfo = 0;
  input.mi.dwFlags = 0;
  input.mi.mouseData = 0;
  input.mi.dx = 0;
  input.mi.dy = 0;
  return input;
}

/**
 * @typedef {Object} MouseButtonOptions
 * @property {'left' | 'middle' | 'right' | 'back' | 'forward'} button The desired button name to click
 * @property {'up' | 'down'} action The desired button action
 */

/**
 * Transforms given mouse button parameters into an appropriate
 * input structure
 *
 * @param {MouseButtonOptions} opts
 * @returns {Promise<INPUT>} The resulting input structure
 * @throws {Error} If the input data is invalid
 */
export async function toMouseButtonInput({button, action}) {
  const clickInput = createDefaultMouseInput();

  let down = true;
  switch (_.toLower(action)) {
    case MOUSE_BUTTON_ACTION.UP:
      down = false;
      break;
    case MOUSE_BUTTON_ACTION.DOWN:
      break;
    default:
      throw new Error(`Mouse button action '${action}' is unknown. ` +
        `Only ${_.values(MOUSE_BUTTON_ACTION)} actions are supported`);
  }

  // If the host is configured to swap left & right buttons, inject swapped
  // events to un-do that re-mapping.
  if (await getSystemMetrics(SM_SWAPBUTTON)) {
    if (button === MOUSE_BUTTON.LEFT) {
      button = MOUSE_BUTTON.RIGHT;
    } else if (button === MOUSE_BUTTON.RIGHT) {
      button === MOUSE_BUTTON.LEFT;
    }
  }
  switch (_.toLower(button)) {
    case MOUSE_BUTTON.LEFT:
      clickInput.mi.dwFlags = down ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
      break;
    case MOUSE_BUTTON.RIGHT:
      clickInput.mi.dwFlags = down ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
      break;
    case MOUSE_BUTTON.MIDDLE:
      clickInput.mi.dwFlags = down ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP;
      break;
    case MOUSE_BUTTON.BACK:
      clickInput.mi.dwFlags = down ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP;
      clickInput.mi.mouseData = XBUTTON1;
      break;
    case MOUSE_BUTTON.FORWARD:
      clickInput.mi.dwFlags = down ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP;
      clickInput.mi.mouseData = XBUTTON2;
      break;
    default:
      throw new Error(`Mouse button '${button}' is unknown. Only ${_.values(MOUSE_BUTTON)} buttons are supported`);
  }

  return clickInput;
}

function clamp (num, min, max) {
  return Math.min(Math.max(num, min), max);
}

/**
 * @typedef {Object} MouseMoveOptions
 * @property {number} dx Horizontal delta relative to the current cursor position as an integer.
 * Most be provided if dy is present
 * @property {number} dy Vertical delta relative to the current cursor position as an integer.
 * Most be provided if dx is present
 * @property {number} x Horizontal absolute cursor position on the virtual desktop as an integer.
 * Most be provided if y is present
 * @property {number} y Vertical absolute cursor position on the virtual desktop as an integer.
 * Most be provided if x is present
 */

/**
 * Transforms given mouse move parameters into an appropriate
 * input structure
 *
 * @param {MouseMoveOptions} opts
 * @returns {Promise<INPUT>} The resulting input structure
 * @throws {Error} If the input data is invalid
 */
export async function toMouseMoveInput({dx, dy, x, y}) {
  const moveInput = createDefaultMouseInput();

  const isAbsolute = _.isInteger(x) && _.isInteger(y);
  const isRelative = _.isInteger(dx) && _.isInteger(dy);
  if (!isAbsolute && !isRelative) {
    throw new Error('Either relative or absolute move coordinates must be provided');
  }

  if (isAbsolute) {
    const [width, height] = await B.all([SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN].map(getSystemMetrics));
    if (width <= 1 || height <= 1) {
      throw new Error('Cannot retrieve virtual screen dimensions via WinAPI');
    }
    x = clamp(x, 0, width);
    y = clamp(y, 0, height);
    moveInput.mi.dx = (x * MOUSE_MOVE_NORM) / (width - 1);
    moveInput.mi.dy = (y * MOUSE_MOVE_NORM) / (height - 1);;
    moveInput.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK;
    return moveInput;
  }
  // Relative

  moveInput.mi.dx = dx;
  moveInput.mi.dy = dy;
  moveInput.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_VIRTUALDESK;
  return moveInput;
}

/**
 * @typedef {Object} MouseWheelOptions
 * @property {number} dx Horizontal scroll delta as an integer.
 * @property {number} dy Vertical scroll delta as an integer.
 */

/**
 * Transforms given mouse wheel parameters into an appropriate
 * input structures
 *
 * @param {MouseWheelOptions} opts
 * @returns {Promise<INPUT[]>} The resulting input structures
 * @throws {Error} If the input data is invalid
 */
export function toMouseWheelInputs({dx, dy}) {
  const result = [];

  const hasHorizontalScroll = _.isInteger(dx);
  const hasVerticalScroll = _.isInteger(dy);
  if (!hasHorizontalScroll && !hasVerticalScroll) {
    throw new Error('Either horizontal or vertical scroll delta must be provided');
  }

  if (hasHorizontalScroll && dx !== 0) {
    const wheelInput = createDefaultMouseInput();
    wheelInput.mi.mouseData = dx;
    // According to MSDN, MOUSEEVENTF_HWHELL and MOUSEEVENTF_WHEEL are both
    // required for a horizontal wheel event.
    wheelInput.mi.dwFlags = MOUSEEVENTF_HWHEEL | MOUSEEVENTF_WHEEL;
    result.push(wheelInput);
  }
  if (hasVerticalScroll && dy !== 0) {
    const wheelInput = createDefaultMouseInput();
    wheelInput.mi.mouseData = dy;
    wheelInput.mi.dwFlags = MOUSEEVENTF_WHEEL;
    result.push(wheelInput);
  }

  return result;
}
