import { setupWAD, downloadWAD, isAdmin } from '../../lib/installer';
import { fs } from 'appium/support';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.should();
chai.use(chaiAsPromised);

describe('installer', function () {

  it('should download the distributable', async function () {
    const tmpPath = await downloadWAD();
    (await fs.exists(tmpPath)).should.be.true;
  });

  it('should fail if not admin', async function () {
    if (await isAdmin()) {
      return this.skip();
    }

    await setupWAD().should.be.rejectedWith(/administrator/);
  });

  it('should setup and validate WinAppDriver as admin', async function () {
    if (!await isAdmin()) {
      return this.skip();
    }

    await setupWAD(); // contains its own verification of md5 so not much to do
  });
});
