import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {WindowsDriver} from '../../lib/driver.js';
import {system} from 'appium/support.js';

describe('driver', () => {
  let originalIsWindows: typeof system.isWindows;

  before(() => {
    originalIsWindows = system.isWindows;
    (system as any).isWindows = () => true;
  });

  after(() => {
    (system as any).isWindows = originalIsWindows;
  });

  describe('constructor', () => {
    it('calls BaseDriver constructor with opts', () => {
      const driver = new WindowsDriver({foo: 'bar'} as any);
      assert.ok(driver);
      assert.equal((driver.opts as any).foo, 'bar');
    });
  });

  describe('createSession', () => {
    it('should set sessionId', async () => {
      const driver = new WindowsDriver({app: 'myapp'} as any, false);
      let startSessionCallCount = 0;
      driver.startWinAppDriverSession = async () => {
        startSessionCallCount++;
      };
      await driver.createSession({
        alwaysMatch: {
          platformName: 'Windows',
          'appium:automationName': 'Windows',
          'appium:app': 'myapp',
        },
        firstMatch: [{}],
      });
      assert.ok(driver.sessionId);
      assert.equal((driver.caps as any).app, 'myapp');
      assert.equal(startSessionCallCount, 1);
    });

    describe('context simulation', () => {
      it('should support context commands', async () => {
        const driver = new WindowsDriver({} as any, false);
        assert.equal(await driver.getCurrentContext(), 'NATIVE_APP');
        assert.deepEqual(await driver.getContexts(), ['NATIVE_APP']);
        await driver.setContext('NATIVE_APP');
      });

      it('should throw an error if invalid context', async () => {
        const driver = new WindowsDriver({} as any, false);
        await assert.rejects(driver.setContext('INVALID_CONTEXT'));
      });
    });
  });

  describe('proxying', () => {
    let driver: WindowsDriver;

    before(() => {
      driver = new WindowsDriver({address: '127.0.0.1', port: 4723} as any, false);
      driver.sessionId = 'abc';
    });

    describe('#proxyActive', () => {
      it('should exist', () => {
        assert.equal(typeof driver.proxyActive, 'function');
      });

      it('should return false by default', () => {
        assert.equal(driver.proxyActive('abc'), false);
      });
    });

    describe('#getProxyAvoidList', () => {
      it('should exist', () => {
        assert.equal(typeof driver.getProxyAvoidList, 'function');
      });

      it('should return jwpProxyAvoid array', () => {
        const avoidList = (driver.getProxyAvoidList as any)('abc');
        assert.ok(Array.isArray(avoidList));
        // eslint-disable-next-line dot-notation
        assert.deepEqual(avoidList, driver['jwpProxyAvoid']);
      });
    });

    describe('#canProxy', () => {
      it('should exist', () => {
        assert.equal(typeof driver.canProxy, 'function');
      });

      it('should return true', () => {
        assert.equal((driver.canProxy as any)('abc'), true);
      });
    });
  });
});
