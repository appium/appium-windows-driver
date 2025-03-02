import { buildWdIoOptions } from '../helpers';
import { remote as wdio } from 'webdriverio';

describe('context', function () {
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

  it('should support context api', async function () {
    (await driver.getAppiumContext()).should.equal('NATIVE_APP');
    (await driver.getAppiumContexts()).should.eql(['NATIVE_APP']);
    await driver.switchAppiumContext('NATIVE_APP');
  });

  it('should throw an error if invalid context', async function () {
    await driver.switchAppiumContext('INVALID_CONTEXT').should.rejected;
  });

});
