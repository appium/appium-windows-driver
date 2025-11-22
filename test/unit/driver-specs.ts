// transpile:mocha

import { WindowsDriver } from '../../lib/driver';
import sinon from 'sinon';
import B from 'bluebird';
import { system } from 'appium/support';
import { expect } from 'chai';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised.default);

describe('driver.js', function () {
  let isWindowsStub: sinon.SinonStub;

  before(async function () {
    isWindowsStub = sinon.stub(system, 'isWindows').returns(true);
  });
  after(function () {
    isWindowsStub.restore();
  });

  describe('constructor', function () {
    it('calls BaseDriver constructor with opts', function () {
      const driver = new WindowsDriver({ foo: 'bar' } as any);
      expect(driver).to.exist;
      expect((driver.opts as any).foo).to.equal('bar');
    });
  });

  describe('createSession', function () {
    it('should set sessionId', async function () {
      const driver = new WindowsDriver({ app: 'myapp'}, false);
      sinon.mock(driver).expects('startWinAppDriverSession')
        .once()
        .returns(B.resolve());
      await driver.createSession(null, null, { alwaysMatch: { 'appium:cap': 'foo' }});
      expect(driver.sessionId).to.exist;
      expect((driver.caps as any).cap).to.equal('foo');
    });

    describe('context simulation', function () {
      it('should support context commands', async function () {
        const driver = new WindowsDriver({ app: 'myapp'}, false);
        expect(await driver.getCurrentContext()).to.equal('NATIVE_APP');
        expect(await driver.getContexts()).to.eql(['NATIVE_APP']);
        await driver.setContext('NATIVE_APP');
      });
      it('should throw an error if invalid context', async function () {
        const driver = new WindowsDriver({ app: 'myapp'}, false);
        await expect(driver.setContext('INVALID_CONTEXT')).to.be.rejected;
      });
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
    let driver: WindowsDriver;
    before(function () {
      driver = new WindowsDriver({}, false);
      driver.sessionId = 'abc';
    });
    describe('#proxyActive', function () {
      it('should exist', function () {
        expect(driver.proxyActive).to.be.an.instanceof(Function);
      });
      it('should return false by default', function () {
        expect(driver.proxyActive('abc')).to.be.false;
      });
      it('should throw an error if session id is wrong', function () {
        expect(() => { driver.proxyActive('aaa'); }).to.throw;
      });
    });

    describe('#getProxyAvoidList', function () {
      it('should exist', function () {
        expect(driver.getProxyAvoidList).to.be.an.instanceof(Function);
      });
      it('should return jwpProxyAvoid array', function () {
        const avoidList = (driver.getProxyAvoidList as any)('abc');
        expect(avoidList).to.be.an.instanceof(Array);
        expect(avoidList).to.eql(driver.jwpProxyAvoid);
      });
      it('should throw an error if session id is wrong', function () {
        expect(() => { (driver.getProxyAvoidList as any)('aaa'); }).to.throw;
      });
    });

    describe('#canProxy', function () {
      it('should exist', function () {
        expect(driver.canProxy).to.be.an.instanceof(Function);
      });
      it('should return true', function () {
        expect((driver.canProxy as any)('abc')).to.be.true;
      });
      it('should throw an error if session id is wrong', function () {
        expect(() => { (driver.canProxy as any)('aaa'); }).to.throw;
      });
    });
  });
});
