import { remote as wdio } from 'webdriverio';
import path from 'path';
import { tempDir, fs } from 'appium/support';
import { isAdmin } from '../../../lib/installer';
import { TEST_HOST, TEST_PORT } from '../constants';


const TEST_CAPS = {
  platformName: 'Windows',
  'appium:automationName': 'windows',
  'appium:app': 'Root',
};

const WDIO_OPTS = {
  hostname: TEST_HOST,
  port: TEST_PORT,
  connectionRetryCount: 0,
  capabilities: TEST_CAPS
};

describe('file movement', function () {
  let driver;
  let remotePath;
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);
  });

  beforeEach(async function () {
    if (process.env.CI || !await isAdmin()) {
      return this.skip();
    }

    driver = await wdio(WDIO_OPTS);
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

    await driver.pushFile(remotePath, base64Data);

    // get the file and its contents, to check
    const remoteData64 = await driver.pullFile(remotePath);
    const remoteData = Buffer.from(remoteData64, 'base64').toString();
    remoteData.should.equal(stringData);
  });

  it('should be able to delete a file', async function () {
    const stringData = `random string data ${Math.random()}`;
    const base64Data = Buffer.from(stringData).toString('base64');
    remotePath = await tempDir.path({ prefix: 'appium', suffix: '.tmp' });

    await driver.pushFile(remotePath, base64Data);

    const remoteData64 = await driver.pullFile(remotePath);
    const remoteData = Buffer.from(remoteData64, 'base64').toString();
    remoteData.should.equal(stringData);

    await driver.execute('windows: deleteFile', { remotePath });

    await driver.pullFile(remotePath).should.eventually.be.rejectedWith(/does not exist/);
  });
});
