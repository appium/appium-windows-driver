import { remote as wdio } from 'webdriverio';
import { isAdmin } from '../../lib/installer';
import { TEST_HOST, TEST_PORT } from './constants';


const TEST_CAPS = {
  platformName: 'Windows',
  'appium:automationName': 'windows',
  'appium:app': 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
};

const WDIO_OPTS = {
  hostname: TEST_HOST,
  port: TEST_PORT,
  connectionRetryCount: 0,
  capabilities: TEST_CAPS
};

describe('Driver', function () {
  let driver;
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
    } finally {
      driver = null;
    }
  });

  it('should run a basic session using a real client', async function () {
    await driver.source().should.eventually.be.not.empty;
  });
});
