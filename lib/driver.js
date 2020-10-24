import _ from 'lodash';
import { BaseDriver } from 'appium-base-driver';
import { system, util } from 'appium-support';
import { WinAppDriver, DEFAULT_WAD_HOST, DEFAULT_WAD_PORT } from './winappdriver';
import logger from './logger';
import { desiredCapConstraints } from './desired-caps';
import commands from './commands/index';
import { findAPortNotInUse } from 'portscanner';
import os from 'os';
import path from 'path';

const NO_PROXY = [
  ['GET', new RegExp('^/session/[^/]+/appium')],
  ['POST', new RegExp('^/session/[^/]+/appium')],
  ['POST', new RegExp('^/session/[^/]+/element/[^/]+/elements?$')],
  ['POST', new RegExp('^/session/[^/]+/elements?$')],
  ['POST', new RegExp('^/session/[^/]+/execute')],
  ['POST', new RegExp('^/session/[^/]+/execute/sync')],
];

// The guard is needed to avoid dynamic system port allocation conflicts for
// parallel driver sessions
const PORT_ALLOCATION_GUARD = util.getLockFileGuard(path.resolve(os.tmpdir(), 'wad_port_guard'), {
  timeout: 5,
  tryRecovery: true,
});

// Appium instantiates this class
class WindowsDriver extends BaseDriver {
  constructor (opts = {}, shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);
    this.desiredCapConstraints = desiredCapConstraints;
    this.jwpProxyActive = false;
    this.jwpProxyAvoid = NO_PROXY;
    this.opts.address = opts.address || DEFAULT_WAD_HOST;

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

  async createSession (jwpCaps, reqCaps /*, w3cCaps */) {
    if (!system.isWindows()) {
      throw new Error('WinAppDriver tests only run on Windows');
    }

    try {
      const [sessionId, caps] = await super.createSession(jwpCaps, reqCaps);
      await this.startWinAppDriverSession();
      return [sessionId, caps];
    } catch (e) {
      await this.deleteSession();
      throw e;
    }
  }

  async allocatePort () {
    if (this.opts.port) {
      return;
    }

    await PORT_ALLOCATION_GUARD(async () => {
      const [startPort, endPort] = [DEFAULT_WAD_PORT, 0xFFFF];
      try {
        this.opts.port = await findAPortNotInUse(startPort, endPort);
      } catch (e) {
        logger.errorAndThrow(
          `Could not find any free port in range ${startPort}..${endPort}. ` +
          `Please check your system firewall settings`);
      }
    });
  }

  async startWinAppDriverSession () {
    await this.allocatePort();

    this.winAppDriver = new WinAppDriver({
      app: this.opts.app,
      port: this.opts.port
    });

    await this.winAppDriver.start();
    await this.winAppDriver.startSession(this.caps);
    this.proxyReqRes = this.winAppDriver.proxyReqRes.bind(this.winAppDriver);
    // now that everything has started successfully, turn on proxying so all
    // subsequent session requests go straight to/from WinAppDriver
    this.jwpProxyActive = true;
  }

  async deleteSession () {
    logger.debug('Deleting WinAppDriver session');

    if (this._screenRecorder) {
      await this._screenRecorder.stop(true);
      this._screenRecorder = null;
    }

    if (this.winAppDriver && this.jwpProxyActive) {
      await this.winAppDriver.deleteSession();
      await this.winAppDriver.stop();
      this.winAppDriver = null;
    }
    this.jwpProxyActive = false;
    await super.deleteSession();
  }

  proxyActive () {
    // we always have an active proxy to the WinAppDriver server
    return true;
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
