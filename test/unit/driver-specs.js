// transpile:mocha

import WindowsDriver from '../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import B from 'bluebird';
import { system } from 'appium-support';


chai.should();
chai.use(chaiAsPromised);

describe('driver.js', function () {
  let isWindowsStub;
  before(function () {
    isWindowsStub = sinon.stub(system, "isWindows").returns(true);
  });
  after(function () {
    isWindowsStub.restore();
  });

  describe('constructor', function () {
    it('calls BaseDriver constructor with opts', function () {
      let driver = new WindowsDriver({ foo: 'bar' });
      driver.should.exist;
      driver.opts.foo.should.equal('bar');
    });
  });

  describe('createSession', function () {
    it('should set sessionId', async function () {
      let driver = new WindowsDriver({ app: 'myapp'}, false);
      sinon.mock(driver).expects('startWinAppDriverSession')
        .once()
        .returns(B.resolve());
      await driver.createSession({ cap: 'foo' });
      driver.sessionId.should.exist;
      driver.caps.cap.should.equal('foo');
    });

    // TODO: Implement or delete
    //it('should set the default context', async function () {
    //  let driver = new SelendroidDriver({}, false);
    //  sinon.mock(driver).expects('checkAppPresent')
    //    .returns(Promise.resolve());
    //  sinon.mock(driver).expects('startSelendroidSession')
    //    .returns(Promise.resolve());
    //  await driver.createSession({});
    //  driver.curContext.should.equal('NATIVE_APP');
    //});
  });

  describe('proxying', function () {
    let driver;
    before(function () {
      driver = new WindowsDriver({}, false);
      driver.sessionId = 'abc';
    });
    describe('#proxyActive', function () {
      it('should exist', function () {
        driver.proxyActive.should.be.an.instanceof(Function);
      });
      it('should return true', function () {
        driver.proxyActive('abc').should.be.true;
      });
      it('should throw an error if session id is wrong', function () {
        (() => { driver.proxyActive('aaa'); }).should.throw;
      });
    });

    // TODO: Implement or delete
    //describe('#getProxyAvoidList', function () {
    //  it('should exist', function () {
    //    driver.getProxyAvoidList.should.be.an.instanceof(Function);
    //  });
    //  it('should return jwpProxyAvoid array', function () {
    //    let avoidList = driver.getProxyAvoidList('abc');
    //    avoidList.should.be.an.instanceof(Array);
    //    avoidList.should.eql(driver.jwpProxyAvoid);
    //  });
    //  it('should throw an error if session id is wrong', function () {
    //    (() => { driver.getProxyAvoidList('aaa'); }).should.throw;
    //  });
    //});

    describe('#canProxy', function () {
      it('should exist', function () {
        driver.canProxy.should.be.an.instanceof(Function);
      });
      it('should return true', function () {
        driver.canProxy('abc').should.be.true;
      });
      it('should throw an error if session id is wrong', function () {
        (() => { driver.canProxy('aaa'); }).should.throw;
      });
    });
  });
});
