import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {remote as wdio} from 'webdriverio';
import type {Browser} from 'webdriverio';
import path from 'node:path';
import {tempDir, fs} from 'appium/support.js';
import {isAdmin} from '../../../lib/installer.js';
import {buildWdIoOptions} from '../helpers.js';

describe('file movement', () => {
  let driver: Browser | null = null;
  let remotePath: string | null = null;

  beforeEach(async () => {
    if (process.env.CI || !(await isAdmin())) {
      return;
    }

    driver = await wdio(buildWdIoOptions('Root'));
  });

  afterEach(async () => {
    try {
      if (driver) {
        await driver.deleteSession();
      }
      if (remotePath && (await fs.exists(remotePath))) {
        await fs.rimraf(path.dirname(remotePath));
      }
    } finally {
      remotePath = null;
      driver = null;
    }
  });

  it('should push and pull a file', async (t) => {
    if (!driver) {
      t.skip('Requires admin privileges outside CI');
      return;
    }
    const stringData = `random string data ${Math.random()}`;
    const base64Data = Buffer.from(stringData).toString('base64');
    remotePath = await tempDir.path({prefix: 'appium', suffix: '.tmp'});

    await driver.pushFile(remotePath, base64Data);

    const remoteData64 = await driver.pullFile(remotePath);
    const remoteData = Buffer.from(remoteData64, 'base64').toString();
    assert.equal(remoteData, stringData);
  });

  it('should be able to delete a file', async (t) => {
    if (!driver) {
      t.skip('Requires admin privileges outside CI');
      return;
    }
    const stringData = `random string data ${Math.random()}`;
    const base64Data = Buffer.from(stringData).toString('base64');
    remotePath = await tempDir.path({prefix: 'appium', suffix: '.tmp'});

    await driver.pushFile(remotePath, base64Data);

    const remoteData64 = await driver.pullFile(remotePath);
    const remoteData = Buffer.from(remoteData64, 'base64').toString();
    assert.equal(remoteData, stringData);

    await driver.execute('windows: deleteFile', {remotePath});

    await assert.rejects(driver.pullFile(remotePath), /does not exist/);
  });
});
