import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {remote as wdio} from 'webdriverio';
import type {Browser} from 'webdriverio';
import {isAdmin} from '../../lib/installer.js';
import {buildWdIoOptions} from './helpers.js';

describe('Driver', () => {
  let driver: Browser | null = null;

  beforeEach(async () => {
    if (process.env.CI || !(await isAdmin())) {
      return;
    }

    driver = await wdio(buildWdIoOptions('Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'));
  });

  afterEach(async () => {
    try {
      if (driver) {
        await driver.deleteSession();
      }
    } finally {
      driver = null;
    }
  });

  it('should run a basic session using a real client', async (t) => {
    if (!driver) {
      t.skip('Requires admin privileges outside CI');
      return;
    }
    assert.notEqual(await (driver as any).source(), '');
  });
});
