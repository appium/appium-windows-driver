import _ from 'lodash';
import { BaseDriver } from 'appium-base-driver';
import { system } from 'appium-support';
import { WinAppDriver, DEFAULT_WAD_HOST, DEFAULT_WAD_PORT } from './winappdriver';
import logger from './logger';

const NO_PROXY = [
  ['POST', new RegExp('^/session/[^/]+/appium/compare_images')],
];

// Appium instantiates this class
class WindowsDriver extends BaseDriver {
  constructor (opts = {}, shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);
    this.jwpProxyActive = false;

    this.jwpProxyAvoid = NO_PROXY;

    this.opts.address = opts.address || DEFAULT_WAD_HOST;
  }

  async createSession (caps, reqCaps, curSessions) {

    if (!system.isWindows()) {
      throw new Error('WinAppDriver tests only run on Windows');
    }
    try {
      let sessionId;
      [sessionId] = await super.createSession(caps);
      await this.startWinAppDriverSession(curSessions);
      return [sessionId, caps];
    } catch (e) {
      await this.deleteSession();
      throw e;
    }
  }

  getNextAvailablePort (curSessions) {
    let newWADPort = DEFAULT_WAD_PORT;

    // start at 4724 and go up till we find a port that isn't in use
    while (_.find(curSessions, (o) => o.WADPort === newWADPort)) {
      newWADPort++;
    }

    return newWADPort;
  }

  async startWinAppDriverSession (curSessions) {

    this.opts.port = this.getNextAvailablePort(curSessions);
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
