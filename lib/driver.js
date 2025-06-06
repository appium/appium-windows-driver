import _ from 'lodash';
import { BaseDriver } from 'appium/driver';
import { system } from 'appium/support';
import { WinAppDriver } from './winappdriver';
import { desiredCapConstraints } from './desired-caps';
import * as appManagementCommands from './commands/app-management';
import * as clipboardCommands from './commands/clipboard';
import * as executeCommands from './commands/execute';
import * as fileCommands from './commands/file-movement';
import * as findCommands from './commands/find';
import * as generalCommands from './commands/general';
import * as gestureCommands from './commands/gestures';
import * as powershellCommands from './commands/powershell';
import * as recordScreenCommands from './commands/record-screen';
import * as touchCommands from './commands/touch';
import * as contextCommands from './commands/context';
import * as logCommands from './commands/log';
import { POWER_SHELL_FEATURE } from './constants';
import { newMethodMap } from './method-map';
import { executeMethodMap } from './execute-method-map';

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
  ['GET', new RegExp('^/session/[^/]+/contexts?')],
  ['POST', new RegExp('^/session/[^/]+/context')],
  ['GET', new RegExp('^/session/[^/]+/log/types')],
  ['POST', new RegExp('^/session/[^/]+/log')],
  ['GET', new RegExp('^/session/[^/]+/se/log/types')],
  ['POST', new RegExp('^/session/[^/]+/se/log')],
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
/**
 * @implements {ExternalDriver<WindowsDriverConstraints, string>}
 * @extends {BaseDriver<WindowsDriverConstraints>}
 */
export class WindowsDriver extends BaseDriver {
  /** @type {boolean} */
  isProxyActive;

  /** @type {import('@appium/types').RouteMatcher[]} */
  jwpProxyAvoid;

  /** @type {WinAppDriver} */
  winAppDriver;

  /** @type {import('./commands/record-screen').ScreenRecorder | null} */
  _screenRecorder;

  static newMethodMap = newMethodMap;
  static executeMethodMap = executeMethodMap;

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
  }

  resetState () {
    this.jwpProxyAvoid = NO_PROXY;
    this.isProxyActive = false;
    // @ts-ignore It's ok
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
      url: this.opts.wadUrl,
      port: this.opts.systemPort,
      reqBasePath: this.basePath,
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

  async proxyCommand (url, method, body) {
    if (!this.winAppDriver?.proxy) {
      throw new Error('The proxy must be defined in order to send commands');
    }
    return /** @type {any} */ (await this.winAppDriver.proxy.command(url, method, body));
  }

  windowsLaunchApp = appManagementCommands.windowsLaunchApp;
  windowsCloseApp = appManagementCommands.windowsCloseApp;

  windowsSetClipboard = clipboardCommands.windowsSetClipboard;
  windowsGetClipboard = clipboardCommands.windowsGetClipboard;

  execute = executeCommands.execute;

  pushFile = fileCommands.pushFile;
  pullFile = fileCommands.pullFile;
  pullFolder = fileCommands.pullFolder;
  windowsDeleteFile = fileCommands.windowsDeleteFile;
  windowsDeleteFolder = fileCommands.windowsDeleteFolder;

  // @ts-ignore This is expected
  findElOrEls = findCommands.findElOrEls;

  getWindowSize = generalCommands.getWindowSize;
  getWindowRect = generalCommands.getWindowRect;
  setWindowRect = generalCommands.setWindowRect;
  getScreenshot = generalCommands.getScreenshot;
  getElementRect = generalCommands.getElementRect;

  windowsClick = gestureCommands.windowsClick;
  windowsScroll = gestureCommands.windowsScroll;
  windowsClickAndDrag = gestureCommands.windowsClickAndDrag;
  windowsHover = gestureCommands.windowsHover;
  windowsKeys = gestureCommands.windowsKeys;

  execPowerShell = powershellCommands.execPowerShell;

  windowsStartRecordingScreen = recordScreenCommands.windowsStartRecordingScreen;
  windowsStopRecordingScreen = recordScreenCommands.windowsStopRecordingScreen;
  startRecordingScreen = recordScreenCommands.startRecordingScreen;
  stopRecordingScreen = recordScreenCommands.stopRecordingScreen;

  performActions = touchCommands.performActions;

  getContexts = contextCommands.getContexts;
  getCurrentContext = contextCommands.getCurrentContext;
  setContext = contextCommands.setContext;

  supportedLogTypes = logCommands.supportedLogTypes;
}

export default WindowsDriver;

/**
 * @typedef {typeof desiredCapConstraints} WindowsDriverConstraints
 * @typedef {import('@appium/types').DriverOpts<WindowsDriverConstraints>} WindowsDriverOpts
 */

/**
 * @template {import('@appium/types').Constraints} C
 * @template [Ctx=string]
 * @typedef {import('@appium/types').ExternalDriver<C, Ctx>} ExternalDriver
 */
