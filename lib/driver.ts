import _ from 'lodash';
import type {
  RouteMatcher,
  HTTPMethod,
  HTTPBody,
  DefaultCreateSessionResult,
  DriverData,
  InitialOpts,
  StringRecord,
  ExternalDriver,
  DriverOpts,
  W3CDriverCaps,
} from '@appium/types';
import { BaseDriver } from 'appium/driver';
import { system } from 'appium/support';
import { WinAppDriver } from './winappdriver';
import type { WindowsDriverCaps } from './winappdriver';
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

const NO_PROXY: RouteMatcher[] = [
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
export class WindowsDriver
  extends BaseDriver<WindowsDriverConstraints, StringRecord>
  implements ExternalDriver<WindowsDriverConstraints, string, StringRecord>
{
  private isProxyActive: boolean;
  private jwpProxyAvoid: RouteMatcher[];
  private _winAppDriver: WinAppDriver | null;
  _screenRecorder: recordScreenCommands.ScreenRecorder | null;
  public proxyReqRes: (...args: any) => any;

  static newMethodMap = newMethodMap;
  static executeMethodMap = executeMethodMap;

  constructor(opts: InitialOpts, shouldValidateCaps = true) {
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

  get winAppDriver(): WinAppDriver {
    if (!this._winAppDriver) {
      throw new Error('WinAppDriver is not started');
    }
    return this._winAppDriver;
  }

  override async createSession(
    w3cCaps1: W3CWindowsDriverCaps,
    w3cCaps2?: W3CWindowsDriverCaps,
    w3cCaps3?: W3CWindowsDriverCaps,
    driverData?: DriverData[]
  ): Promise<DefaultCreateSessionResult<WindowsDriverConstraints>> {
    if (!system.isWindows()) {
      throw new Error('WinAppDriver tests only run on Windows');
    }

    try {
      const [sessionId, caps] = await super.createSession(w3cCaps1, w3cCaps2, w3cCaps3, driverData);
      this.caps = caps;
      this.opts = this.opts as WindowsDriverOpts;
      if (caps.prerun) {
        this.log.info('Executing prerun PowerShell script');
        const prerun = caps.prerun as PrerunCapability;
        if (!_.isString(prerun.command) && !_.isString(prerun.script)) {
          throw new Error(`'prerun' capability value must either contain ` +
            `'script' or 'command' entry of string type`);
        }
        this.assertFeatureEnabled(POWER_SHELL_FEATURE);
        const output = await this.execPowerShell(prerun);
        if (output) {
          this.log.info(`Prerun script output: ${output}`);
        }
      }
      await this.startWinAppDriverSession();
      return [sessionId, caps];
    } catch (e: any) {
      await this.deleteSession();
      throw e;
    }
  }

  override async deleteSession(): Promise<void> {
    this.log.debug('Deleting WinAppDriver session');
    await this._screenRecorder?.stop(true);
    await this._winAppDriver?.stop();

    const postrun = this.opts.postrun as PostrunCapability | undefined;
    if (postrun) {
      if (!_.isString(postrun.command) && !_.isString(postrun.script)) {
        this.log.error(`'postrun' capability value must either contain ` +
          `'script' or 'command' entry of string type`);
      } else {
        this.log.info('Executing postrun PowerShell script');
        try {
          this.assertFeatureEnabled(POWER_SHELL_FEATURE);
          const output = await this.execPowerShell(postrun);
          if (output) {
            this.log.info(`Postrun script output: ${output}`);
          }
        } catch (e: any) {
          this.log.error(e.message);
        }
      }
    }

    this.resetState();

    await super.deleteSession();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override proxyActive(sessionId: string): boolean {
    return this.isProxyActive;
  }

  override canProxy(): boolean {
    // we can always proxy to the WinAppDriver server
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override getProxyAvoidList(sessionId: string): RouteMatcher[] {
    return this.jwpProxyAvoid;
  }

  async proxyCommand(url: string, method: HTTPMethod, body: HTTPBody = null): Promise<any> {
    if (!this.winAppDriver?.proxy) {
      throw new Error('The proxy must be defined in order to send commands');
    }
    return await this.winAppDriver.proxy.command(url, method, body);
  }

  async startWinAppDriverSession(): Promise<void> {
    this._winAppDriver = new WinAppDriver(this.log, {
      url: this.opts.wadUrl,
      port: this.opts.systemPort,
      reqBasePath: this.basePath,
    });
    await this.winAppDriver.start(this.caps as any as WindowsDriverCaps);
    this.proxyReqRes = this.winAppDriver.proxy?.proxyReqRes.bind(this.winAppDriver.proxy);
    // now that everything has started successfully, turn on proxying so all
    // subsequent session requests go straight to/from WinAppDriver
    this.isProxyActive = true;
  }

  private resetState(): void {
    this.jwpProxyAvoid = NO_PROXY;
    this.isProxyActive = false;
    this._winAppDriver = null;
    this._screenRecorder = null;
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

interface PrerunCapability {
  command?: string;
  script?: string;
}

interface PostrunCapability {
  command?: string;
  script?: string;
}

type WindowsDriverConstraints = typeof desiredCapConstraints;
type WindowsDriverOpts = DriverOpts<WindowsDriverConstraints>;
type W3CWindowsDriverCaps = W3CDriverCaps<WindowsDriverConstraints>;
