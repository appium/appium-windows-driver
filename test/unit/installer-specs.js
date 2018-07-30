import { setupWAD } from '../../lib/installer';
import { system } from 'appium-support';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

chai.should();
chai.use(chaiAsPromised);

describe('downloading WAD', function () {
  let isWindowsStub;
  before(function () {
    isWindowsStub = sinon.stub(system, "isWindows").returns(false);
  });
  after(function () {
    isWindowsStub.restore();
  });

  it('should throw an error if we are not on windows', async function () {
    await setupWAD().should.be.rejectedWith(/Windows/);
  });
});
