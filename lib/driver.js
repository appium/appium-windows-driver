import _ from 'lodash';
import { BaseDriver } from 'appium/driver';
import { system } from 'appium/support';
import { WinAppDriver } from './winappdriver';
import { desiredCapConstraints } from './desired-caps';
import commands from './commands/index';
import { POWER_SHELL_FEATURE } from './constants';
import { newMethodMap } from './method-map';

/** @type {import('@appium/types').RouteMatcher[]} */
const NO_PROXY = [
  ['GET', new RegExp('^/session/[^/]+/appium/(?!app/)[^/]+')],
  ['POST', new RegExp('^/session/[^/]+/appium/(?!app/)[^/]+')],
  ['POST', new RegExp('^/session/[^/]+/element/[^/]+/elements?$')],
  ['POST', new RegExp('^/session/[^/]+/elements?$')],
  ['POST', new RegExp('^/session/[^/]+/execute')],
  ['POST', new RegExp('^/session/[^/]+/execute/sync')],
  ['POST', new RegExp('^/session/[^/]+/appium/device/push_file')],
  ['POST', new RegExp('^/session/[^/]+/appium/device/pull_file')],
  ['POST', new RegExp('^/session/[^/]+/appium/device/pull_folder')],
  ['GET', new RegExp('^/session/[^/]+/screenshot')],
  // Workarounds for
  // - https://github.com/appium/appium/issues/15923
  // - https://github.com/appium/appium/issues/16316
  // TODO: Remove it after WAD properly supports W3C
  ['GET', new RegExp('^/session/[^/]+/element/[^/]+/rect')],
  ['POST', new RegExp('^/session/[^/]+/window/rect')],
  ['GET', new RegExp('^/session/[^/]+/window/rect')],
  // end workaround
];

// Appium instantiates this class
class WindowsDriver extends BaseDriver {
  /** @type {boolean} */
  isProxyActive;

  /** @type {(toRun: {command?: string; script?: string}) => Promise<string>} */
  execPowerShell;

  /** @type {import('@appium/types').RouteMatcher[]} */
  jwpProxyAvoid;

  static newMethodMap = newMethodMap;

  constructor (opts = {}, shouldValidateCaps = true) {
    // @ts-ignore TODO: Make opts typed
    super(opts, shouldValidateCaps);
    this.desiredCapConstraints = desiredCapConstraints;
    this.locatorStrategies = [
      'xpath',
      'id',
      'name',
      'tag name',
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

  // @ts-ignore TODO: Make args typed
  async createSession (...args) {
    if (!system.isWindows()) {
      throw new Error('WinAppDriver tests only run on Windows');
    }

    try {
      // @ts-ignore TODO: Make args typed
      const [sessionId, caps] = await super.createSession(...args);
      if (caps.prerun) {
        this.log.info('Executing prerun PowerShell script');
        if (!_.isString(caps.prerun.command) && !_.isString(caps.prerun.script)) {
          throw new Error(`'prerun' capability value must either contain ` +
            `'script' or 'command' entry of string type`);
        }
        this.assertFeatureEnabled(POWER_SHELL_FEATURE);
        const output = await this.execPowerShell(caps.prerun);
        if (output) {
          this.log.info(`Prerun script output: ${output}`);
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
    this.winAppDriver = new WinAppDriver(this.log, {
      port: this.opts.systemPort,
    });
    await this.winAppDriver.start(this.caps);
    this.proxyReqRes = this.winAppDriver.proxy?.proxyReqRes.bind(this.winAppDriver.proxy);
    // now that everything has started successfully, turn on proxying so all
    // subsequent session requests go straight to/from WinAppDriver
    this.isProxyActive = true;
  }

  async deleteSession () {
    this.log.debug('Deleting WinAppDriver session');
    await this._screenRecorder?.stop(true);
    await this.winAppDriver?.stop();

    if (this.opts.postrun) {
      if (!_.isString(this.opts.postrun.command) && !_.isString(this.opts.postrun.script)) {
        this.log.error(`'postrun' capability value must either contain ` +
          `'script' or 'command' entry of string type`);
      } else {
        this.log.info('Executing postrun PowerShell script');
        try {
          this.assertFeatureEnabled(POWER_SHELL_FEATURE);
          const output = await this.execPowerShell(this.opts.postrun);
          if (output) {
            this.log.info(`Postrun script output: ${output}`);
          }
        } catch (e) {
          this.log.error(e.message);
        }
      }
    }

    this.resetState();

    await super.deleteSession();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  proxyActive (sessionId) {
    return this.isProxyActive;
  }

  canProxy () {
    // we can always proxy to the WinAppDriver server
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getProxyAvoidList (sessionId) {
    return this.jwpProxyAvoid;
  }

  async proxyCommand (url, method, body = null) {
    if (!this.winAppDriver?.proxy) {
      throw new Error('The proxy must be defined in order to send commands');
    }
    return await this.winAppDriver.proxy.command(url, method, body);
  }
}

export { WindowsDriver };
export default WindowsDriver;

/**
 * @typedef {typeof desiredCapConstraints} WindowsDriverConstraints
 * @typedef {import('@appium/types').DriverOpts<WindowsDriverConstraints>} WindowsDriverOpts
 */