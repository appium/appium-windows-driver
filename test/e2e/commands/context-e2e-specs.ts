import { buildWdIoOptions } from '../helpers';
import { remote as wdio } from 'webdriverio';
import type { Browser } from 'webdriverio';
import { expect } from 'chai';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised.default);

describe('context', function () {
  let driver: Browser | null = null;

  before(async function () {
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
    expect(await driver!.getAppiumContext()).to.equal('NATIVE_APP');
    expect(await driver!.getAppiumContexts()).to.eql(['NATIVE_APP']);
    await driver!.switchAppiumContext('NATIVE_APP');
  });

  it('should throw an error if invalid context', async function () {
    await expect(driver!.switchAppiumContext('INVALID_CONTEXT')).to.be.rejected;
  });

});
