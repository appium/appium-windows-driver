import { remote as wdio } from 'webdriverio';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { startServer } from '../../lib/server';
import { isAdmin } from '../../lib/installer';

chai.should();
chai.use(chaiAsPromised);

const TEST_PORT = 4788;
const TEST_HOST = 'localhost';

const TEST_CAPS = {
  platformName: 'Windows',
  'appium:app': 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
};

const WDIO_OPTS = {
  hostname: TEST_HOST,
  port: TEST_PORT,
  connectionRetryCount: 0,
  capabilities: TEST_CAPS
};

describe('Driver', async function () {
  if (!await isAdmin()) {
    return;
  }

  let server;
  let driver;

  before(async function () {
    server = await startServer(TEST_PORT, TEST_HOST);
  });

  after(async function () {
    if (server) {
      await server.close();
    }
    server = null;
  });

  beforeEach(async function () {
    if (server) {
      driver = await wdio(WDIO_OPTS);
    }
  });

  afterEach(async function () {
    if (driver) {
      await driver.quit();
    }
    driver = null;
  });

  it('should run a basic session using a real client', async function () {
    await driver.source().should.eventually.be.not.empty;
  });
});
