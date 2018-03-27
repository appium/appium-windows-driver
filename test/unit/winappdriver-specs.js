// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import WinAppDriverServer from '../../lib/winappdriver';
import { withMocks } from 'appium-test-support';

chai.should();
chai.use(chaiAsPromised);

function buildWinAppDriverOpts () {
  return {
    app: 'foo',
    host: 'localhost',
    port: 4723
  };
}

describe('WinAppDriverServer', function () {
  describe('#constructor', function () {
    it('should complain if required options not sent', function () {
      (() => {
        new WinAppDriverServer();
      }).should.throw(/Option.*app.*required/);
      (() => {
        new WinAppDriverServer({});
      }).should.throw(/Option.*app.*required/);
    });
  });

  describe('#startSession', withMocks({ }, (mocks, S) => {
    let winAppDriver = new WinAppDriverServer(buildWinAppDriverOpts());

    it('should start a session', async function () {
      let caps = { foo: 'bar' };
      mocks.jwproxy = S.sandbox.mock(winAppDriver.jwproxy);
      mocks.jwproxy.expects("command").once()
        .withExactArgs("/session", "POST", { desiredCapabilities: caps })
        .returns(Promise.resolve());
      await winAppDriver.startSession(caps);
      mocks.jwproxy.verify();
    });
  }));
});

