import { buildWdIoOptions } from '../helpers';
import { remote as wdio } from 'webdriverio';
import type { Browser } from 'webdriverio';
import { expect } from 'chai';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised.default);

describe('log', function () {
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

  it('should get the list of available logs', async function () {
    expect(await driver!.getLogTypes()).to.eql(['server']);
  });

  it('should throw an error when an invalid type is given', async function () {
    await expect(driver!.getLogs('INVALID_LOG_TYPE')).to.be.rejected;
  });

  it('should get server logs', async function () {
    expect(await driver!.getLogs('server')).to.be.an('array');
  });
});
