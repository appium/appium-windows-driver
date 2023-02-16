import _ from 'lodash';
import ffi from 'ffi-napi';
import ref from 'ref-napi';
import StructType from 'ref-struct-napi';
import UnionType from 'ref-union-napi';
import B from 'bluebird';

// Mostly ported from
// https://chromium.googlesource.com/chromium/src/+/refs/heads/main/remoting/host/input_injector_win.cc

const getUser32 = _.memoize(function getUser32() {
  return ffi.Library('user32.dll', {
    // UINT SendInput(
    //   _In_ UINT cInputs,                     // number of input in the array
    //   _In_reads_(cInputs) LPINPUT pInputs,  // array of inputs
    //   _In_ int cbSize);                      // sizeof(INPUT)
    SendInput: ['uint32', ['uint32', 'pointer', 'int32']],
    // int GetSystemMetrics(
    //  [in] int nIndex
    // );
    GetSystemMetrics: ['int32', ['int32']],
  });
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

const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 0x0002;
export const KEY_ACTION = Object.freeze({
  UP: 'up',
  DOWN: 'down',
});

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
    getUser32().SendInput.async(inputsCount, inputs, INPUT.size,
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
  if (uSent !== inputsCount) {
    throw new Error(`SendInput API call failed`);
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

  return INPUT({
    type: INPUT_KEYBOARD,
    union: INPUT_UNION({
      ki: KEYBDINPUT({
        wVK: virtualKeyCode,
        time: 0,
        dwExtraInfo: ref.NULL_POINTER,
        wScan: 0,
        dwFlags: down ? 0 : KEYEVENTF_KEYUP,
      })
    })
  });
}

/**
 * Sends the provided input structures to SendInput WinAPI
 *
 * @param {INPUT|INPUT[]} inputs single INPUT structure or
 * an array of input structures. Consider combining keyboard inputs only.
 * This API does not like combining two or more mouse inputs in one call.
 * @throws {Error} If any of the given inputs has not been successfully executed.
 */
export async function handleInputs(inputs) {
  const hasArray = _.isArray(inputs);
  // https://stackoverflow.com/questions/41350341/using-sendinput-in-node-ffi
  if (hasArray && inputs.length > 1) {
    const inputsArray = Buffer.alloc(INPUT.size * inputs.length);
    for (let i = 0; i < inputs.length; ++i) {
      inputs[i].ref().copy(inputsArray, i * INPUT.size);
    }
    return await sendInputs(inputsArray, true);
  }
  if (hasArray && inputs.length === 1 || !hasArray) {
    return await sendInputs((hasArray ? inputs[0] : inputs).ref(), false);
  }
  throw new Error('At least one input must be provided');
}

/**
 * Transforms the provided key modifiers array into the sequence
 * of functional key inputs.
 *
 * @param {string[]|string} modifierKeys Array of key modifiers or a single key name
 * @param {'down' | 'up'} action Either 'down' to depress the key or 'up' to release it
 * @returns {INPUT[]} Array of inputs or an empty array if no inputs were parsed.
 */
export function toModifierInputs(modifierKeys, action) {
  const events = [];
  const usedKeys = new Set();
  for (const keyName of (_.isArray(modifierKeys) ? modifierKeys : [modifierKeys])) {
    const lowerKeyName = _.toLower(keyName);
    if (usedKeys.has(lowerKeyName)) {
      continue;
    }

    const virtualKeyCode = MODIFIER_KEY[lowerKeyName];
    if (_.isUndefined(virtualKeyCode)) {
      throw new Error(`Modifier key name '${keyName}' is unknown. ` +
        `Supported key names are: ${_.keys(MODIFIER_KEY)}`);
    }
    events.push({virtualKeyCode, action});
    usedKeys.add(lowerKeyName);
  }
  return events.map(toKeyInput);
}

async function getSystemMetrics(nIndex) {
  return await new B((resolve, reject) =>
    // eslint-disable-next-line promise/prefer-await-to-callbacks
    getUser32().GetSystemMetrics.async(nIndex, (error, result) => error ? reject(error) : resolve(result))
  );
}

function createMouseInput (params = {}) {
  return INPUT({
    type: INPUT_MOUSE,
    union: INPUT_UNION({
      mi: MOUSEINPUT({
        time: 0,
        dwExtraInfo: ref.NULL_POINTER,
        dwFlags: 0,
        dx: 0,
        dy: 0,
        mouseData: 0,
        ...params,
      })
    })
  });
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
      return createMouseInput({
        dwFlags: down ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP,
      });
    case MOUSE_BUTTON.RIGHT:
      return createMouseInput({
        dwFlags: down ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP,
      });
    case MOUSE_BUTTON.MIDDLE:
      return createMouseInput({
        dwFlags: down ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP,
      });
    case MOUSE_BUTTON.BACK:
      return createMouseInput({
        dwFlags: down ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP,
        mouseData: XBUTTON1,
      });
    case MOUSE_BUTTON.FORWARD:
      return createMouseInput({
        dwFlags: down ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP,
        mouseData: XBUTTON2,
      });
    default:
      throw new Error(`Mouse button '${button}' is unknown. Only ${_.values(MOUSE_BUTTON)} buttons are supported`);
  }
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
  const isAbsolute = _.isInteger(x) && _.isInteger(y);
  const isRelative = _.isInteger(dx) && _.isInteger(dy);
  if (!isAbsolute && !isRelative) {
    throw new Error('Either relative or absolute move coordinates must be provided');
  }

  if (isAbsolute) {
    const [width, height] = await B.all([SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN].map(getSystemMetrics));
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
    // According to MSDN, MOUSEEVENTF_HWHELL and MOUSEEVENTF_WHEEL are both
    // required for a horizontal wheel event.
    result.push(createMouseInput({
      mouseData: dx,
      dwFlags: MOUSEEVENTF_HWHEEL | MOUSEEVENTF_WHEEL,
    }));
  }
  if (hasVerticalScroll && dy !== 0) {
    result.push(createMouseInput({
      mouseData: dy,
      dwFlags: MOUSEEVENTF_WHEEL,
    }));
  }

  return result;
}
