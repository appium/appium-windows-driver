import { remote as wdio } from 'webdriverio';
import type { Browser } from 'webdriverio';
import path from 'path';
import { tempDir, fs } from 'appium/support';
import { isAdmin } from '../../../lib/installer';
import { buildWdIoOptions } from '../helpers';
import { expect } from 'chai';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised.default);

describe('file movement', function () {
  let driver: Browser | null = null;
  let remotePath: string | null = null;

  beforeEach(async function () {
    if (process.env.CI || !await isAdmin()) {
      return this.skip();
    }

    driver = await wdio(buildWdIoOptions('Root'));
  });

  afterEach(async function () {
    try {
      if (driver) {
        await driver.deleteSession();
      }
      if (remotePath) {
        if (await fs.exists(remotePath)) {
          await fs.rimraf(path.dirname(remotePath));
        }
      }
    } finally {
      remotePath = null;
      driver = null;
    }
  });

  it('should push and pull a file', async function () {
    const stringData = `random string data ${Math.random()}`;
    const base64Data = Buffer.from(stringData).toString('base64');
    remotePath = await tempDir.path({ prefix: 'appium', suffix: '.tmp' });

    await driver!.pushFile(remotePath, base64Data);

    // get the file and its contents, to check
    const remoteData64 = await driver!.pullFile(remotePath);
    const remoteData = Buffer.from(remoteData64, 'base64').toString();
    expect(remoteData).to.equal(stringData);
  });

  it('should be able to delete a file', async function () {
    const stringData = `random string data ${Math.random()}`;
    const base64Data = Buffer.from(stringData).toString('base64');
    remotePath = await tempDir.path({ prefix: 'appium', suffix: '.tmp' });

    await driver!.pushFile(remotePath, base64Data);

    const remoteData64 = await driver!.pullFile(remotePath);
    const remoteData = Buffer.from(remoteData64, 'base64').toString();
    expect(remoteData).to.equal(stringData);

    await driver!.execute('windows: deleteFile', { remotePath });

    await expect(driver!.pullFile(remotePath)).to.eventually.be.rejectedWith(/does not exist/);
  });
});
