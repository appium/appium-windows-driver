import wd from 'wd';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { startServer } from '../../lib/server';
import { isAdmin } from '../../lib/installer';
chai.should();
chai.use(chaiAsPromised);

const TEST_PORT = 4788;
const TEST_HOST = 'localhost';

describe('Driver', async function () {
  if (!await isAdmin()) {
    return;
  }

  let server;
  let driver;

  before(async function () {
    if (await isAdmin()) {
      server = await startServer(TEST_PORT, TEST_HOST);
    }
  });

  after(async function () {
    if (server) {
      await server.close();
    }
    server = null;
  });

  beforeEach(function () {
    if (server) {
      driver = wd.promiseChainRemote(TEST_HOST, TEST_PORT);
    }
  });

  afterEach(async function () {
    if (driver) {
      await driver.quit();
    }
    driver = null;
  });

  it('should run a basic session using a real client', async function () {
    await driver.init({
      app: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      platformName: 'Windows',
    });
    await driver.elementByName('Calculator');
  });
});
