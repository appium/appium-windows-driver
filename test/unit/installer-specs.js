import { setupWAD } from '../../lib/installer';
import { system } from 'appium/support';
import sinon from 'sinon';


describe('downloading WAD', function () {
  let isWindowsStub;
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    should = chai.should();
    chai.use(chaiAsPromised.default);

    isWindowsStub = sinon.stub(system, 'isWindows').returns(false);
  });
  after(function () {
    isWindowsStub.restore();
  });

  it('should throw an error if we are not on windows', async function () {
    await setupWAD().should.be.rejectedWith(/Windows/);
  });
});
