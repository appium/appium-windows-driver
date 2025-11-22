import { remote as wdio } from 'webdriverio';
import type { Browser } from 'webdriverio';
import { isAdmin } from '../../lib/installer';
import { buildWdIoOptions } from './helpers';
import { expect } from 'chai';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised.default);

describe('Driver', function () {
  let driver: Browser | null = null;

  beforeEach(async function () {
    if (process.env.CI || !await isAdmin()) {
      return this.skip();
    }

    driver = await wdio(buildWdIoOptions('Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'));
  });

  afterEach(async function () {
    try {
      if (driver) {
        await driver.deleteSession();
      }
    } finally {
      driver = null;
    }
  });

  it('should run a basic session using a real client', async function () {
    await expect((driver as any).source()).to.eventually.be.not.empty;
  });
});
