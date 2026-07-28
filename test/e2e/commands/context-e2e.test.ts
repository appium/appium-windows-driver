import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';

import {remote as wdio} from 'webdriverio';
import type {Browser} from 'webdriverio';

import {buildWdIoOptions} from '../helpers.js';

describe('context', () => {
  let driver: Browser | null = null;

  before(async () => {
    driver = await wdio(buildWdIoOptions('Root'));
  });

  after(async () => {
    try {
      if (driver) {
        await driver.deleteSession();
      }
    } finally {
      driver = null;
    }
  });

  it('should support context api', async () => {
    assert.equal(await driver!.getAppiumContext(), 'NATIVE_APP');
    assert.deepEqual(await driver!.getAppiumContexts(), ['NATIVE_APP']);
    await driver!.switchAppiumContext('NATIVE_APP');
  });

  it('should throw an error if invalid context', async () => {
    await assert.rejects(driver!.switchAppiumContext('INVALID_CONTEXT'));
  });
});
