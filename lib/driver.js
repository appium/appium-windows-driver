import _ from 'lodash';
import { BaseDriver } from 'appium-base-driver';
import { system } from 'appium-support';
import { WinAppDriver } from './winappdriver';
import log from './logger';
import { desiredCapConstraints } from './desired-caps';
import commands from './commands/index';
import { POWER_SHELL_FEATURE } from 'constants';

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
    this.locatorStrategies = [
      'xpath',
      'id',
      'name',
      'class name',
      'accessibility id',
    ];
    this.resetState();

    for (const [cmd, fn] of _.toPairs(commands)) {
      WindowsDriver.prototype[cmd] = fn;
    }
  }

  resetState () {
    this.jwpProxyAvoid = NO_PROXY;
    this.isProxyActive = false;
    this.winAppDriver = null;
    this._screenRecorder = null;
  }

  async createSession (...args) {
    if (!system.isWindows()) {
      throw new Error('WinAppDriver tests only run on Windows');
    }

    try {
      const [sessionId, caps] = await super.createSession(...args);
      if (caps.prerun) {
        log.info('Executing prerun PowerShell script');
        if (!_.isString(caps.prerun.command) && !_.isString(caps.prerun.script)) {
          throw new Error(`'prerun' capability value must either contain ` +
            `'script' or 'command' entry of string type`);
        }
        this.ensureFeatureEnabled(POWER_SHELL_FEATURE);
        const output = await this.execPowerShell(caps.prerun);
        if (output) {
          log.info(`Prerun script output: ${output}`);
        }
      }
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
    log.debug('Deleting WinAppDriver session');
    await this._screenRecorder?.stop(true);
    await this.winAppDriver?.stop();

    if (this.opts.postrun) {
      if (!_.isString(this.opts.postrun.command) && !_.isString(this.opts.postrun.script)) {
        log.error(`'postrun' capability value must either contain ` +
          `'script' or 'command' entry of string type`);
      } else {
        log.info('Executing postrun PowerShell script');
        try {
          this.ensureFeatureEnabled(POWER_SHELL_FEATURE);
          const output = await this.execPowerShell(this.opts.postrun);
          if (output) {
            log.info(`Postrun script output: ${output}`);
          }
        } catch (e) {
          log.error(e.message);
        }
      }
    }

    this.resetState();

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
}

export { WindowsDriver };
export default WindowsDriver;
