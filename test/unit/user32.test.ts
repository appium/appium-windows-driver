import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {createNativeLibsLoadError, loadFfi} from '../../lib/commands/winapi/user32.js';

describe('user32 native library loading', () => {
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
});
