import assert from 'node:assert/strict';
import {afterEach, describe, it} from 'node:test';

import {
  createNativeLibsLoadError,
  ensureDpiAwareness,
  getUser32,
  loadFfi,
  toPhysicalScreenCoordinates,
  type Point,
  type User32,
} from '../../lib/commands/winapi/user32.js';

describe('user32 native library loading', () => {
  afterEach(() => {
    ensureDpiAwareness.cache.clear();
    getUser32.cache.clear();
  });

  it('keeps the error that prevented koffi from loading', () => {
    const {ffi, loadError} = loadFfi(() => {
      throw new Error('Cannot find the native Koffi module; did you bundle it correctly?');
    });
    assert.equal(ffi, undefined);
    assert.equal(loadError?.message, 'Cannot find the native Koffi module; did you bundle it correctly?');
  });

  it('names the real cause in the error thrown by native calls', () => {
    const cause = new Error("Cannot find module 'koffi'\nRequire stack:\n- user32.js");
    const err = createNativeLibsLoadError(cause);
    assert.match(err.message, /optional 'koffi' module could not be loaded \(Cannot find module 'koffi'\)/);
    assert.match(err.message, /npm install koffi/);
    assert.doesNotMatch(err.message, /Visual Studio/);
    assert.equal(err.cause, cause);
  });

  it('loads koffi when it is installed', () => {
    const fake = {load: () => ({})};
    const {ffi, loadError} = loadFfi(() => fake);
    assert.equal(ffi, fake);
    assert.equal(loadError, undefined);
  });

  it('returns mutated point from LogicalToPhysicalPointForPerMonitorDPI when conversion succeeds', async () => {
    const hwnd = 0x12345678n;
    const mockUser32: User32 = {
      SendInput: async () => 1,
      GetSystemMetrics: async () => 0,
      SetProcessDpiAwarenessContext: async () => 1,
      WindowFromPoint: async () => hwnd,
      LogicalToPhysicalPointForPerMonitorDPI: async (passedHwnd: unknown, pt: Point) => {
        assert.equal(passedHwnd, hwnd);
        pt.x = Math.round(pt.x * 1.25);
        pt.y = Math.round(pt.y * 1.25);
        return 1;
      },
      GetDpiForSystem: async () => 96,
    };
    ensureDpiAwareness.cache.set(undefined, Promise.resolve(true));
    getUser32.cache.set(undefined, mockUser32);

    const coords = await toPhysicalScreenCoordinates(400, 200);
    assert.deepEqual(coords, [500, 250]);
  });

  it('falls back to GetDpiForSystem when WindowFromPoint returns null', async () => {
    let logicalToPhysicalCalled = false;
    const mockUser32: User32 = {
      SendInput: async () => 1,
      GetSystemMetrics: async () => 0,
      SetProcessDpiAwarenessContext: async () => 1,
      WindowFromPoint: async () => null,
      LogicalToPhysicalPointForPerMonitorDPI: async () => {
        logicalToPhysicalCalled = true;
        return 0;
      },
      GetDpiForSystem: async () => 120,
    };
    ensureDpiAwareness.cache.set(undefined, Promise.resolve(true));
    getUser32.cache.set(undefined, mockUser32);

    const coords = await toPhysicalScreenCoordinates(400, 200);
    assert.equal(logicalToPhysicalCalled, false);
    assert.deepEqual(coords, [500, 250]);
  });
});
