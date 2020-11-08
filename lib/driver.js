import _ from 'lodash';
import { BaseDriver } from 'appium-base-driver';
import { system } from 'appium-support';
import { WinAppDriver } from './winappdriver';
import logger from './logger';
import { desiredCapConstraints } from './desired-caps';
import commands from './commands/index';

const NO_PROXY = [
  ['GET', new RegExp('^/session/[^/]+/appium/(?!app/)[^/]+')],
  ['POST', new RegExp('^/session/[^/]+/appium/(?!app/)[^/]+')],
  ['POST', new RegExp('^/session/[^/]+/element/[^/]+/elements?$')],
  ['POST', new RegExp('^/session/[^/]+/elements?$')],
  ['POST', new RegExp('^/session/[^/]+/execute')],
  ['POST', new RegExp('^/session/[^/]+/execute/sync')],
];

// Appium instantiates this class
class WindowsDriver extends BaseDriver {
  constructor (opts = {}, shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);
    this.desiredCapConstraints = desiredCapConstraints;
    this.jwpProxyAvoid = NO_PROXY;
    this.isProxyActive = false;
    this.locatorStrategies = [
      'xpath',
      'id',
      'name',
      'class name',
      'accessibility id',
    ];

    for (const [cmd, fn] of _.toPairs(commands)) {
      WindowsDriver.prototype[cmd] = fn;
    }
  }

  async createSession (...args) {
    if (!system.isWindows()) {
      throw new Error('WinAppDriver tests only run on Windows');
    }

    try {
      const [sessionId, caps] = await super.createSession(...args);
      await this.startWinAppDriverSession();
      return [sessionId, caps];
    } catch (e) {
      await this.deleteSession();
      throw e;
    }
  }

  async startWinAppDriverSession () {
    this.winAppDriver = new WinAppDriver({
      port: this.opts.systemPort,
    });
    await this.winAppDriver.start(this.caps);
    this.proxyReqRes = this.winAppDriver.proxy.proxyReqRes.bind(this.winAppDriver.proxy);
    // now that everything has started successfully, turn on proxying so all
    // subsequent session requests go straight to/from WinAppDriver
    this.isProxyActive = true;
  }

  async deleteSession () {
    logger.debug('Deleting WinAppDriver session');
    await this._screenRecorder?.stop(true);
    this._screenRecorder = null;
    await this.winAppDriver?.stop();
    this.winAppDriver = null;
    this.isProxyActive = false;
    await super.deleteSession();
  }

  proxyActive () {
    return this.isProxyActive;
  }

  canProxy () {
    // we can always proxy to the WinAppDriver server
    return true;
  }

  getProxyAvoidList (/*sessionId*/) {
    return this.jwpProxyAvoid;
  }

  get driverData () {
    return {WADPort: this.opts.port};
  }
}

export { WindowsDriver };
export default WindowsDriver;
