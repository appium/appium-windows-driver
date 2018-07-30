// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import WinAppDriverServer from '../../lib/winappdriver';
import { withSandbox } from 'appium-test-support';
import B from 'bluebird';


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
  describe('#startSession', withSandbox({}, function (S) {
    let winAppDriver = new WinAppDriverServer(buildWinAppDriverOpts());

    afterEach(function () {
      S.verify();
    });

    it('should start a session', async function () {
      let caps = { foo: 'bar' };
      S.mocks.jwproxy = S.sandbox.mock(winAppDriver.jwproxy);
      S.mocks.jwproxy.expects("command").once()
        .withExactArgs("/session", "POST", { desiredCapabilities: caps })
        .returns(B.resolve());
      await winAppDriver.startSession(caps);
    });
  }));
});
