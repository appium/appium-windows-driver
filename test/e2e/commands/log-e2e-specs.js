import { buildWdIoOptions } from '../helpers';
import { remote as wdio } from 'webdriverio';

describe('log', function () {
  let chai;
  /** @type {import('webdriverio').Browser} */
  let driver;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    driver = await wdio(buildWdIoOptions('Root'));
  });

  after(async function () {
    try {
      if (driver) {
        await driver.deleteSession();
      }
    } finally {
      driver = null;
    }
  });

  it('should get the list of available logs', async function () {
    (await driver.getLogTypes()).should.eql(['server']);
  });

  it('should throw an error when an invalid type is given', async function () {
    await driver.getLogs('INVALID_LOG_TYPE').should.be.rejected;
  });

  it('should get server logs', async function () {
    (await driver.getLogs('server')).should.be.an('array');
  });
});
