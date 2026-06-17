import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {buildWdIoOptions} from '../helpers.js';
import {remote as wdio} from 'webdriverio';
import type {Browser} from 'webdriverio';

describe('log', () => {
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

  it('should get the list of available logs', async () => {
    assert.deepEqual(await driver!.getLogTypes(), ['server']);
  });

  it('should throw an error when an invalid type is given', async () => {
    await assert.rejects(driver!.getLogs('INVALID_LOG_TYPE'));
  });

  it('should get server logs', async () => {
    assert.ok(Array.isArray(await driver!.getLogs('server')));
  });
});
