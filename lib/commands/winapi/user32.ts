import {memoize} from '../../utils';
import type {load, sizeof, struct, union} from 'koffi';
import {createInvalidArgumentError} from './errors';
import {util} from 'appium/support';
import nodeUtil from 'node:util';
import type {Position, Size} from '@appium/types';

type KoffiModule = {
  load: typeof load;
  struct: typeof struct;
  union: typeof union;
  sizeof: typeof sizeof;
};

let ffi: KoffiModule | undefined;
try {
  ffi = require('koffi') as KoffiModule;
} catch {}
let StructType: typeof struct | undefined;
try {
  StructType = ffi?.struct;
} catch {}
let UnionType: typeof union | undefined;
try {
  UnionType = ffi?.union;
} catch {}

export type User32 = {
  SendInput: (cInputs: number, pInputs: unknown, cbSize: number) => Promise<number>;
  GetSystemMetrics: (nIndex: number) => Promise<number>;
  SetProcessDpiAwarenessContext: (value: number) => Promise<number>;
};
export type KeyInput = {
  type: number;
  union: {
    ki: {
      wVk: number;
      time: number;
      dwExtraInfo: number;
      wScan: number;
      dwFlags: number;
    };
  };
};
export type MouseInput = {
  type: number;
  union: {
    mi: {
      time: number;
      dwExtraInfo: number;
      dwFlags: number;
      dx: number;
      dy: number;
      mouseData: number;
    };
  };
};

const NATIVE_LIBS_LOAD_ERROR =
  `Native Windows API calls cannot be invoked. ` +
  `Please make sure you have the latest version of Visual Studio` +
  `including the "Desktop development with C++" workload. ` +
  `Afterwards reinstall the Windows driver.`;

function requireNativeType<T>(typ: T | undefined): T {
  if (typ == null) {
    const throwingFactory = () => () => {
      throw new Error(NATIVE_LIBS_LOAD_ERROR);
    };
    return throwingFactory as unknown as T;
  }
  return typ;
}

const getUser32 = memoize(function getUser32(): User32 {
  if (!ffi) {
    throw new Error(NATIVE_LIBS_LOAD_ERROR);
  }
  const user32 = ffi.load('user32.dll');
  const raw = {
    SendInput: nodeUtil.promisify(
      user32.func(
        'unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)',
      ).async,
    ),
    GetSystemMetrics: nodeUtil.promisify(
      user32.func('int __stdcall GetSystemMetrics(int nIndex)').async,
    ),
    SetProcessDpiAwarenessContext: nodeUtil.promisify(
      user32.func('int __stdcall SetProcessDpiAwarenessContext(int value)').async,
    ),
  };
  return raw as User32;
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
const VK_RETURN = 0x0d;
const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_LWIN = 0x5b;
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
const SM_XVIRTUALSCREEN = 76;
const SM_YVIRTUALSCREEN = 77;
const SM_CXVIRTUALSCREEN = 78;
const SM_CYVIRTUALSCREEN = 79;
const MOUSE_MOVE_NORM = 0xffff;
const WHEEL_DELTA = 120;
// const DPI_AWARENESS_CONTEXT_UNAWARE = 16;
// const DPI_AWARENESS_CONTEXT_SYSTEM_AWARE = 17;
// const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE = 18;
const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = 34;

export interface MouseButtonOptions {
  button: (typeof MOUSE_BUTTON)[keyof typeof MOUSE_BUTTON];
  action: (typeof MOUSE_BUTTON_ACTION)[keyof typeof MOUSE_BUTTON_ACTION];
}

type KeybdInputFields = Partial<{
  wVk: number;
  wScan: number;
  dwFlags: number;
  time: number;
  dwExtraInfo: number;
}>;

/**
 * Builds an INPUT structure for keyboard injection via SendInput.
 *
 * @param params Key input field overrides merged into the default keyboard payload.
 */
export function createKeyInput(params: KeybdInputFields = {}): KeyInput {
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
      },
    },
  };
}

// Mostly ported from
// https://chromium.googlesource.com/chromium/src/+/refs/heads/main/remoting/host/input_injector_win.cc

/**
 * Sends input structure(s) to the SendInput WinAPI (prefer batching keyboard inputs).
 *
 * @param inputs A single INPUT payload or an array of INPUT payloads.
 * @returns Number of successfully sent input payloads.
 */
export async function handleInputs(inputs: object | object[]): Promise<number> {
  const inputsArr = Array.isArray(inputs) ? inputs : [inputs];
  const cbSize = ffi ? ffi.sizeof(INPUT) : 0;
  const uSent = await getUser32().SendInput(inputsArr.length, inputsArr, cbSize);
  if (uSent !== inputsArr.length) {
    throw new Error(
      `SendInput API call failed. ${util.pluralize('input', uSent, true)} succeeded out of ${inputsArr.length}`,
    );
  }
  return uSent;
}

/** Ensures DPI awareness for the current process. */
export const ensureDpiAwareness = memoize(async function ensureDpiAwareness(): Promise<boolean> {
  return Boolean(
    await getUser32().SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2),
  );
});

async function getSystemMetrics(nIndex: number): Promise<number> {
  return await getUser32().GetSystemMetrics(nIndex);
}

const isLeftMouseButtonSwapped = memoize(
  async function isLeftMouseButtonSwapped(): Promise<boolean> {
    return Boolean(await getSystemMetrics(SM_SWAPBUTTON));
  },
);

/**
 * Builds a mouse button SendInput structure (click, press, or release).
 *
 * @param opts Mouse button and action pair to convert.
 * @returns SendInput payload for the requested button action.
 */
export async function toMouseButtonInput({
  button,
  action,
}: MouseButtonOptions): Promise<MouseInput> {
  // If the host is configured to swap left & right buttons, inject swapped
  // events to un-do that re-mapping.
  if (await isLeftMouseButtonSwapped()) {
    if (button === MOUSE_BUTTON.LEFT) {
      button = MOUSE_BUTTON.RIGHT;
    } else if (button === MOUSE_BUTTON.RIGHT) {
      button = MOUSE_BUTTON.LEFT;
    }
  }

  let evtDown: number;
  let evtUp: number;
  let mouseData: number | undefined;
  switch (button.toLowerCase()) {
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
        `Mouse button '${button}' is unknown. Only ${Object.values(MOUSE_BUTTON)} buttons are supported`,
      );
  }

  let dwFlags: number;
  switch (action.toLowerCase()) {
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
          `Only ${[MOUSE_BUTTON_ACTION.UP, MOUSE_BUTTON_ACTION.DOWN]} actions are supported`,
      );
  }

  return createMouseInput({
    dwFlags,
    ...(mouseData == null ? {} : {mouseData}),
  });
}

/**
 * Transforms mouse move parameters into a SendInput structure.
 *
 * @param x Absolute horizontal cursor coordinate.
 * @param y Absolute vertical cursor coordinate.
 * @param screenSize Optional virtual screen size cache; fetched when omitted.
 * @returns SendInput payload for moving the mouse to the target coordinates.
 * @see https://www.reddit.com/r/cpp_questions/comments/1eslzdv/difficulty_with_win32_mouse_position/
 */
export async function toMouseMoveInput(
  x: number,
  y: number,
  screenSize: Size | null = null,
): Promise<MouseInput> {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw createInvalidArgumentError('Both move coordinates must be provided');
  }

  const {width, height} = screenSize ?? (await getVirtualScreenSize());
  if (width <= 1 || height <= 1) {
    throw new Error('Cannot retrieve virtual screen dimensions via GetSystemMetrics WinAPI');
  }
  const {x: startX, y: startY} = await getVirtualScreenPosition();
  const clampedX = clamp(x - startX, 0, width);
  const clampedY = clamp(y - startY, 0, height);
  return createMouseInput({
    dx: (clampedX * MOUSE_MOVE_NORM) / (width - 1),
    dy: (clampedY * MOUSE_MOVE_NORM) / (height - 1),
    dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
  });
}

/**
 * Builds a mouse wheel SendInput structure, or returns null when the delta is zero.
 *
 * @param dx Horizontal scroll delta. Provide either this or `dy`.
 * @param dy Vertical scroll delta. Provide either this or `dx`.
 * @returns SendInput payload, or null when effective scroll delta is zero.
 */
export function toMouseWheelInput(dx?: number, dy?: number): MouseInput | null {
  const hasHorizontalScroll = Number.isInteger(dx);
  const hasVerticalScroll = Number.isInteger(dy);
  if (!hasHorizontalScroll && !hasVerticalScroll) {
    throw createInvalidArgumentError('Either horizontal or vertical scroll delta must be provided');
  }
  if (hasHorizontalScroll && hasVerticalScroll) {
    throw createInvalidArgumentError(
      'Either horizontal or vertical scroll delta must be provided, but not both',
    );
  }

  if (hasHorizontalScroll && dx !== 0) {
    // According to MSDN, MOUSEEVENTF_HWHELL and MOUSEEVENTF_WHEEL are both
    // required for a horizontal wheel event.
    return createMouseInput({
      mouseData: (dx as number) * WHEEL_DELTA,
      dwFlags: MOUSEEVENTF_HWHEEL | MOUSEEVENTF_WHEEL,
    });
  }
  if (hasVerticalScroll && dy !== 0) {
    return createMouseInput({
      mouseData: (dy as number) * WHEEL_DELTA,
      dwFlags: MOUSEEVENTF_WHEEL,
    });
  }
  return null;
}

/**
 * Expands Unicode text into key-down/key-up SendInput pairs (Unicode mode).
 *
 * @param text Text to emit as keyboard input.
 * @returns Sequence of keyboard INPUT payloads.
 */
export function toUnicodeKeyInputs(text: string): KeyInput[] {
  const utf16Text = Buffer.from(text, 'ucs2');
  const charCodes = new Uint16Array(utf16Text.buffer, utf16Text.byteOffset, utf16Text.length / 2);
  const result: ReturnType<typeof createKeyInput>[] = [];
  for (const [, charCode] of charCodes.entries()) {
    // The WM_CHAR event generated for carriage return is '\r', not '\n', and
    // some applications may check for VK_RETURN explicitly, so handle
    // newlines specially.
    if (charCode === 0x0a) {
      result.push(
        createKeyInput({wVk: VK_RETURN, dwFlags: 0}),
        createKeyInput({wVk: VK_RETURN, dwFlags: KEYEVENTF_KEYUP}),
      );
    }
    result.push(
      createKeyInput({wScan: charCode, dwFlags: KEYEVENTF_UNICODE}),
      createKeyInput({wScan: charCode, dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP}),
    );
  }
  return result;
}

/** Virtual monitor width/height from GetSystemMetrics. */
export async function getVirtualScreenSize(): Promise<Size> {
  const [width, height] = await Promise.all(
    [SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN].map(getSystemMetrics),
  );
  return {width, height};
}

/** Virtual monitor origin from GetSystemMetrics. */
export async function getVirtualScreenPosition(): Promise<Position> {
  const [x, y] = await Promise.all([SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN].map(getSystemMetrics));
  return {x, y};
}

function createMouseInput(
  params: Partial<{
    dx: number;
    dy: number;
    mouseData: number;
    dwFlags: number;
    time: number;
    dwExtraInfo: number;
  }> = {},
): MouseInput {
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
      },
    },
  };
}

function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max);
}
