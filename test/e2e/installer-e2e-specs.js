/* eslint-disable no-console */

import { setupWAD, WAD_GUID } from '../../lib/installer';
import { exec } from 'teen_process';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.should();
chai.use(chaiAsPromised);

describe('downloading WAD', function () {
  before(async function () {
    // uninstall WAD first
    try {
      await exec('msiexec', [`/X{${WAD_GUID}}`, '/q']);
    } catch (err) {
      // if we get a 1605 error, that's ok, that means nothing was installed
      // if we get some other kind of error, we should fail this test
      if (err.code === 1603) {
        console.log("You need to be an admin to run this test");
      }
      if (err.code !== 1605) {
        throw err;
      }
    }
  });

  it('should download and validate WinAppDriver', async function () {
    await setupWAD(); // contains its own verification of md5 so not much to do
  });
});