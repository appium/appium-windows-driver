import _ from 'lodash';
import B from 'bluebird';
import { createInvalidArgumentError } from './errors';
import { util } from 'appium/support';
import nodeUtil from 'node:util';

let /** @type {import('koffi')|undefined} */ ffi;
try {
  ffi = require('koffi');
} catch {}
let /** @type {import('koffi').struct|undefined} */ StructType;
try {
  StructType = ffi?.struct;
} catch {}
let /** @type {any|undefined} */ UnionType;
try {
  // @ts-ignore This is a typedef bug in koffi lib
  UnionType = ffi?.union;
} catch {}

const NATIVE_LIBS_LOAD_ERROR = `Native Windows API calls cannot be invoked. ` +
  `Please make sure you have the latest version of Visual Studio` +
  `including the "Desktop development with C++" workload. ` +
  `Afterwards reinstall the Windows driver.`;

function requireNativeType(typ) {
  return _.isNil(typ)
    ? () => () => { throw new Error(NATIVE_LIBS_LOAD_ERROR); }
    : typ;
}

const getUser32 = _.memoize(function getUser32() {
  if (!ffi) {
    throw new Error(NATIVE_LIBS_LOAD_ERROR);
  }
  const user32 = ffi.load('user32.dll');
  return {
    SendInput: nodeUtil.promisify(
      user32.func('unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)').async
    ),
    GetSystemMetrics: nodeUtil.promisify(
      user32.func('int __stdcall GetSystemMetrics(int nIndex)').async
    ),
  };
});

// https://koffi.dev/unions#win32-example

// typedef struct tagMOUSEINPUT {
//   LONG    dx;
//   LONG    dy;
//   DWORD   mouseData;
//   DWORD   dwFlags;
//   DWORD   time;
//   ULONG_PTR dwExtraInfo;
// } MOUSEINPUT;
const MOUSEINPUT = requireNativeType(StructType)('MOUSEINPUT', {
  dx: 'long',
  dy: 'long',
  // https://github.com/microsoft/win32metadata/issues/933
  mouseData: 'uint32_t',
  dwFlags: 'uint32_t',
  time: 'uint32_t',
  dwExtraInfo: 'uintptr_t',
});

// typedef struct tagKEYBDINPUT {
//   WORD    wVk;
//   WORD    wScan;
//   DWORD   dwFlags;
//   DWORD   time;
//   ULONG_PTR dwExtraInfo;
// } KEYBDINPUT;
const KEYBDINPUT = requireNativeType(StructType)('KEYBDINPUT', {
  wVk: 'uint16_t',
  wScan: 'uint16_t',
  dwFlags: 'uint32_t',
  time: 'uint32_t',
  dwExtraInfo: 'uintptr_t',
});

// typedef struct tagHARDWAREINPUT {
//   DWORD   uMsg;
//   WORD    wParamL;
//   WORD    wParamH;
// } HARDWAREINPUT;
const HARDWAREINPUT = requireNativeType(StructType)('HARDWAREINPUT', {
  uMsg: 'uint32_t',
  wParamL: 'uint16_t',
  wParamH: 'uint16_t',
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
const INPUT_UNION = requireNativeType(UnionType)('INPUT_UNION', {
  mi: MOUSEINPUT,
  ki: KEYBDINPUT,
  hi: HARDWAREINPUT,
});
const INPUT = requireNativeType(StructType)('INPUT', {
  type: 'uint32_t',
  union: INPUT_UNION,
});

const INPUT_KEYBOARD = 1;
export const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;
export const KEY_ACTION = Object.freeze({
  UP: 'up',
  DOWN: 'down',
});
const VK_RETURN = 0x0D;
const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_LWIN = 0x5B;
const VK_ALT = 0x12;
export const MODIFIER_KEY = Object.freeze({
  shift: VK_SHIFT,
  ctrl: VK_CONTROL,
  alt: VK_ALT,
  win: VK_LWIN,
});

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
  // This action is an intenal one
  CLICK: 'click',
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
const WHEEL_DELTA = 120;


export function createKeyInput(params = {}) {
  return {
    type: INPUT_KEYBOARD,
    union: {
      ki: {
        wVk: 0,
        time: 0,
        dwExtraInfo: 0,
        wScan: 0,
        dwFlags: 0,
        ...params,
      }
    }
  };
}

// Mostly ported from
// https://chromium.googlesource.com/chromium/src/+/refs/heads/main/remoting/host/input_injector_win.cc

/**
 * Sends the provided input structures to SendInput WinAPI
 *
 * @param {object|object[]} inputs single INPUT structure or
 * an array of input structures. Consider combining keyboard inputs only.
 * @throws {Error} If any of the given inputs has not been successfully executed.
 */
export async function handleInputs(inputs) {
  const inputsArr = _.isArray(inputs) ? inputs : [inputs];
  const uSent = await getUser32().SendInput(
    inputsArr.length,
    inputsArr,
    ffi?.sizeof(INPUT)
  );
  if (uSent !== inputsArr.length) {
    throw new Error(
      `SendInput API call failed. ${util.pluralize('input', uSent, true)} succeeded out of ${inputsArr.length}`
    );
  }
  return uSent;
}

async function getSystemMetrics(nIndex) {
  return await getUser32().GetSystemMetrics(nIndex);
}

const isLeftMouseButtonSwapped = _.memoize(async function isLeftMouseButtonSwapped () {
  return Boolean(await getSystemMetrics(SM_SWAPBUTTON));
});

function createMouseInput (params = {}) {
  return {
    type: INPUT_MOUSE,
    union: {
      mi: {
        time: 0,
        dwExtraInfo: 0,
        dwFlags: 0,
        dx: 0,
        dy: 0,
        mouseData: 0,
        ...params,
      }
    }
  };
}

/**
 * @typedef {Object} MouseButtonOptions
 * @property {typeof MOUSE_BUTTON[keyof typeof MOUSE_BUTTON]} button The desired button name to click
 * @property {typeof MOUSE_BUTTON_ACTION[keyof typeof MOUSE_BUTTON_ACTION]} action The desired button action
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
  // If the host is configured to swap left & right buttons, inject swapped
  // events to un-do that re-mapping.
  if (await isLeftMouseButtonSwapped()) {
    if (button === MOUSE_BUTTON.LEFT) {
      button = MOUSE_BUTTON.RIGHT;
    } else if (button === MOUSE_BUTTON.RIGHT) {
      button = MOUSE_BUTTON.LEFT;
    }
  }

  let evtDown;
  let evtUp;
  let mouseData;
  switch (_.toLower(button)) {
    case MOUSE_BUTTON.LEFT:
      [evtDown, evtUp] = [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP];
      break;
    case MOUSE_BUTTON.RIGHT:
      [evtDown, evtUp] = [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP];
      break;
    case MOUSE_BUTTON.MIDDLE:
      [evtDown, evtUp] = [MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP];
      break;
    case MOUSE_BUTTON.BACK:
      [evtDown, evtUp] = [MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP];
      mouseData = XBUTTON1;
      break;
    case MOUSE_BUTTON.FORWARD:
      [evtDown, evtUp] = [MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP];
      mouseData = XBUTTON2;
      break;
    default:
      throw createInvalidArgumentError(
        `Mouse button '${button}' is unknown. Only ${_.values(MOUSE_BUTTON)} buttons are supported`
      );
  }

  let dwFlags;
  switch (_.toLower(action)) {
    case MOUSE_BUTTON_ACTION.UP:
      dwFlags = evtUp;
      break;
    case MOUSE_BUTTON_ACTION.DOWN:
      dwFlags = evtDown;
      break;
    case MOUSE_BUTTON_ACTION.CLICK:
      dwFlags = evtDown | evtUp;
      break;
    default:
      throw createInvalidArgumentError(
        `Mouse button action '${action}' is unknown. ` +
        `Only ${[MOUSE_BUTTON_ACTION.UP, MOUSE_BUTTON_ACTION.DOWN]} actions are supported`
      );
  }

  return createMouseInput({
    dwFlags,
    ...(_.isNil(mouseData) ? {} : {mouseData}),
  });
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
 * @param {Partial<MouseMoveOptions>} opts
 * @param {Size?} screenSize
 * @returns {Promise<INPUT>} The resulting input structure
 * @throws {Error} If the input data is invalid
 */
export async function toMouseMoveInput({dx, dy, x, y}, screenSize = null) {
  const isAbsolute = _.isInteger(x) && _.isInteger(y);
  const isRelative = _.isInteger(dx) && _.isInteger(dy);
  if (!isAbsolute && !isRelative) {
    throw createInvalidArgumentError('Either relative or absolute move coordinates must be provided');
  }

  if (isAbsolute) {
    const {width, height} = screenSize ?? await getVirtualScreenSize();
    if (width <= 1 || height <= 1) {
      throw new Error('Cannot retrieve virtual screen dimensions via GetSystemMetrics WinAPI');
    }
    x = clamp(x, 0, width);
    y = clamp(y, 0, height);
    return createMouseInput({
      dx: (x * MOUSE_MOVE_NORM) / (width - 1),
      dy: (y * MOUSE_MOVE_NORM) / (height - 1),
      dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
    });
  }
  // Relative coordinates

  return createMouseInput({
    dx, dy,
    dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_VIRTUALDESK,
  });
}

/**
 * @typedef {Object} MouseWheelOptions
 * @property {number} dx Horizontal scroll delta as an integer.
 * If provided then no vertical scroll delta must be set.
 * @property {number} dy Vertical scroll delta as an integer.
 * If provided then no horizontal scroll delta must be set.
 */

/**
 * Transforms given mouse wheel parameters into an appropriate
 * input structure
 *
 * @param {MouseWheelOptions} opts
 * @returns {INPUT | null} The resulting input structure or null
 * if no input has been generated.
 * @throws {Error} If the input data is invalid
 */
export function toMouseWheelInput({dx, dy}) {
  const hasHorizontalScroll = _.isInteger(dx);
  const hasVerticalScroll = _.isInteger(dy);
  if (!hasHorizontalScroll && !hasVerticalScroll) {
    throw createInvalidArgumentError('Either horizontal or vertical scroll delta must be provided');
  }
  if (hasHorizontalScroll && hasVerticalScroll) {
    throw createInvalidArgumentError('Either horizontal or vertical scroll delta must be provided, but not both');
  }

  if (hasHorizontalScroll && dx !== 0) {
    // According to MSDN, MOUSEEVENTF_HWHELL and MOUSEEVENTF_WHEEL are both
    // required for a horizontal wheel event.
    return createMouseInput({
      mouseData: dx * WHEEL_DELTA,
      dwFlags: MOUSEEVENTF_HWHEEL | MOUSEEVENTF_WHEEL,
    });
  }
  if (hasVerticalScroll && dy !== 0) {
    return createMouseInput({
      mouseData: dy * WHEEL_DELTA,
      dwFlags: MOUSEEVENTF_WHEEL,
    });
  }
  return null;
}

/**
 * Transforms the given Unicode text into an array of inputs
 * ready to be used as parameters for SendInput API
 *
 * @param {string} text An arbitrary Unicode string
 * @returns {object[]} Array of key inputs
 */
export function toUnicodeKeyInputs(text) {
  const utf16Text = Buffer.from(text, 'ucs2');
  const charCodes = new Uint16Array(utf16Text.buffer, utf16Text.byteOffset, utf16Text.length / 2);
  const result = [];
  for (const [, charCode] of charCodes.entries()) {
    // The WM_CHAR event generated for carriage return is '\r', not '\n', and
    // some applications may check for VK_RETURN explicitly, so handle
    // newlines specially.
    if (charCode === 0x0A) {
      result.push(
        createKeyInput({wVk: VK_RETURN, dwFlags: 0}),
        createKeyInput({wVk: VK_RETURN, dwFlags: KEYEVENTF_KEYUP})
      );
    }
    result.push(
      createKeyInput({wScan: charCode, dwFlags: KEYEVENTF_UNICODE}),
      createKeyInput({wScan: charCode, dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP})
    );
  }
  return result;
}

/**
 * @typedef {Object} Size
 * @property {number} width
 * @property {number} height
 */

/**
 * Fetches the size of the virtual screen
 *
 * @returns {Promise<Size>}
 */
export async function getVirtualScreenSize () {
  const [width, height] = await B.all([SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN].map(getSystemMetrics));
  return {width, height};
}
