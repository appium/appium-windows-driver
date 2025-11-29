import _ from 'lodash';
import os from 'node:os';
import path from 'node:path';
import type { AppiumLogger, ProxyOptions, HTTPMethod, HTTPBody } from '@appium/types';
import { JWProxy, errors } from 'appium/driver';
import { SubProcess } from 'teen_process';
import { getWADExecutablePath } from './installer';
import { waitForCondition } from 'asyncbox';
import { execSync } from 'child_process';
import { util } from 'appium/support';
import { findAPortNotInUse, checkPortStatus } from 'portscanner';
import { desiredCapConstraints } from './desired-caps';

const DEFAULT_BASE_PATH = '/wd/hub';
const DEFAULT_HOST = '127.0.0.1';
const WAD_PORT_RANGE = [4724, 4824] as const;
const STARTUP_TIMEOUT_MS = 10000;
const DEFAULT_CREATE_SESSION_TIMEOUT_MS = 20000; // retry start session creation during the timeout in milliseconds
// The guard is needed to avoid dynamic system port allocation conflicts for
// parallel driver sessions
const PORT_ALLOCATION_GUARD = util.getLockFileGuard(path.resolve(os.tmpdir(), 'wad_port_guard'), {
  timeout: 5,
  tryRecovery: true,
});
const TROUBLESHOOTING_LINK = 'https://github.com/appium/appium-windows-driver?tab=readme-ov-file#troubleshooting';

class WADProxy extends JWProxy {
  didProcessExit?: boolean;

  async isListening(): Promise<boolean> {
    const url = this.getUrlForProxy('/status');
    const parsedUrl = new URL(url);
    const defaultPort = parsedUrl.protocol === 'https:' ? 443 : 80;
    try {
      await checkPortStatus(parseInt(parsedUrl.port, 10) || defaultPort, parsedUrl.hostname);
      return true;
    } catch {
      return false;
    }
  }

  override async proxyCommand(url: string, method: HTTPMethod, body: HTTPBody = null): Promise<any> {
    if (this.didProcessExit) {
      throw new errors.InvalidContextError(
        `'${method} ${url}' cannot be proxied to WinAppDriver server because ` +
        'its process is not running (probably crashed). Check the Appium log for more details');
    }
    return await super.proxyCommand(url, method, body);
  }
}

class WADProcess {
  private readonly log: AppiumLogger;
  readonly base: string;
  port?: number;
  private readonly executablePath: string;
  proc: SubProcess | null;
  private readonly isForceQuitEnabled: boolean;

  constructor(log: AppiumLogger, opts: WADProcessOptions) {
    this.log = log;
    this.base = opts.base;
    this.port = opts.port;
    this.executablePath = opts.executablePath;
    this.proc = null;
    this.isForceQuitEnabled = opts.isForceQuitEnabled;
  }

  get isRunning(): boolean {
    return !!(this.proc?.isRunning);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (!this.port) {
      await PORT_ALLOCATION_GUARD(async () => {
        const [startPort, endPort] = WAD_PORT_RANGE;
        try {
          this.port = await findAPortNotInUse(startPort, endPort);
        } catch {
          throw this.log.errorWithException(
            `Could not find any free port in range ${startPort}..${endPort}. ` +
            `Please check your system firewall settings or set 'systemPort' capability ` +
            `to the desired port number`);
        }
      });
    }

    const args = [`${this.port}${this.base}`];

    if (this.isForceQuitEnabled) {
      args.push('/forcequit');
    }

    this.proc = new SubProcess(this.executablePath, args, {
      encoding: 'ucs2'
    });
    this.proc.on('output', (stdout, stderr) => {
      const line = _.trim(stderr || stdout);
      if (line) {
        this.log.debug(line);
      }
    });
    this.proc.on('exit', (code, signal) => {
      this.log.info(`WinAppDriver exited with code ${code}, signal ${signal}`);
    });
    this.log.info(`Spawning '${this.executablePath}' with args: ${JSON.stringify(args)}`);
    await this.proc.start(0);
  }

  async stop(): Promise<void> {
    if (this.isRunning) {
      try {
        await this.proc?.stop();
      } catch (e: any) {
        this.log.warn(`WinAppDriver process with PID ${this.proc?.pid} cannot be stopped. ` +
          `Original error: ${e.message}`);
      }
    }
  }
}

const RUNNING_PROCESS_IDS: (number | undefined)[] = [];
process.once('exit', () => {
  if (_.isEmpty(RUNNING_PROCESS_IDS)) {
    return;
  }

  const command = 'taskkill.exe ' + RUNNING_PROCESS_IDS.map((pid) => `/PID ${pid}`).join(' ');
  try {
    execSync(command);
  } catch {}
});

export class WinAppDriver {
  private readonly log: AppiumLogger;
  private readonly opts: WinAppDriverOptions;
  private process: WADProcess | null;
  private _proxy: WADProxy | null;

  constructor(log: AppiumLogger, opts: WinAppDriverOptions) {
    this.log = log;
    this.opts = opts;

    this.process = null;
    this._proxy = null;
  }

  get proxy(): WADProxy {
    if (!this._proxy) {
      throw new Error('WinAppDriver proxy is not initialized');
    }
    return this._proxy;
  }

  async start(caps: WindowsDriverCaps): Promise<void> {
    if (this.opts.url) {
      await this._prepareSessionWithCustomServer(this.opts.url);
    } else {
      const isForceQuitEnabled = caps['ms:forcequit'] === true;
      await this._prepareSessionWithBuiltInServer(isForceQuitEnabled);
    }

    await this._startSession(caps);
  }

  async stop(): Promise<void> {
    if (!this.process?.isRunning) {
      return;
    }

    if (this.proxy?.sessionId) {
      this.log.debug('Deleting WinAppDriver server session');
      try {
        await this.proxy.command('', 'DELETE');
      } catch (err: any) {
        this.log.warn(`Did not get confirmation WinAppDriver deleteSession worked; ` +
          `Error was: ${err.message}`);
      }
    }

    await this.process.stop();
  }

  async sendCommand(url: string, method: HTTPMethod, body: HTTPBody = null): Promise<any> {
    return await this.proxy?.command(url, method, body);
  }

  private async _prepareSessionWithBuiltInServer(isForceQuitEnabled: boolean): Promise<void> {
    const executablePath = await getWADExecutablePath();
    this.process = new WADProcess(this.log, {
      base: DEFAULT_BASE_PATH,
      port: this.opts.port,
      executablePath,
      isForceQuitEnabled,
    });
    await this.process.start();

    if (!this.process.port) {
      throw new Error('WinAppDriver process port was not set after starting');
    }

    const proxyOpts: ProxyOptions = {
      log: this.log,
      base: this.process.base,
      server: DEFAULT_HOST,
      port: this.process.port,
    };
    if (this.opts.reqBasePath) {
      proxyOpts.reqBasePath = this.opts.reqBasePath;
    }
    this._proxy = new WADProxy(proxyOpts);
    this.proxy.didProcessExit = false;
    this.process.proc?.on('exit', () => {
      if (this.proxy) {
        this.proxy.didProcessExit = true;
      }
    });

    let lastError: Error | undefined;
    try {
      await waitForCondition(async () => {
        try {
          if (this.proxy) {
            await this.proxy.command('/status', 'GET');
            return true;
          }
        } catch (err: any) {
          if (this.proxy?.didProcessExit) {
            throw new Error(err.message);
          }
          lastError = err;
          return false;
        }
      }, {
        waitMs: STARTUP_TIMEOUT_MS,
        intervalMs: 1000,
      });
    } catch (e: any) {
      if (!lastError || this.proxy.didProcessExit) {
        throw e;
      }

      const serverUrl = this.proxy.getUrlForProxy('/status');
      let errorMessage = (
        `WinAppDriver server '${executablePath}' is not listening at ${serverUrl} ` +
        `after ${STARTUP_TIMEOUT_MS}ms timeout. Make sure it could be started manually.`
      );
      if (await this.proxy.isListening()) {
        errorMessage = (
          `WinAppDriver server '${executablePath}' is listening at ${serverUrl}, ` +
          `but fails to respond with a proper status. It is an issue with the server itself. ` +
          `Consider checking the troubleshooting guide at ${TROUBLESHOOTING_LINK}. ` +
          `Original error: ${(lastError ?? e).message}`
        );
      }
      throw new Error(errorMessage);
    }
    const pid = this.process.proc?.pid;
    if (pid) {
      RUNNING_PROCESS_IDS.push(pid);
      this.process.proc?.on('exit', () => void _.pull(RUNNING_PROCESS_IDS, pid));
    }
  }

  private async _prepareSessionWithCustomServer(url: string): Promise<void> {
    this.log.info(`Using custom WinAppDriver server URL: ${url}`);

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (e: any) {
      throw new Error(
        `Cannot parse the provided WinAppDriver URL '${url}'. Original error: ${e.message}`
      );
    }
    const proxyOpts: ProxyOptions = {
      log: this.log,
      base: _.trimEnd(parsedUrl.pathname, '/'),
      server: parsedUrl.hostname,
      port: parseInt(parsedUrl.port, 10),
      scheme: _.trimEnd(parsedUrl.protocol, ':') as 'http' | 'https',
    };
    if (this.opts.reqBasePath) {
      proxyOpts.reqBasePath = this.opts.reqBasePath;
    }
    this._proxy = new WADProxy(proxyOpts);

    try {
      await this.proxy.command('/status', 'GET');
    } catch (e: any) {
      let errorMessage = (
        `WinAppDriver server is not listening at ${url}. ` +
        `Make sure it is running and the provided wadUrl is correct`
      );
      if (await this.proxy.isListening()) {
        errorMessage = (
          `WinAppDriver server is listening at ${url}, but fails to respond with a proper status. ` +
          `It is an issue with the server itself. ` +
          `Consider checking the troubleshooting guide at ${TROUBLESHOOTING_LINK}. ` +
          `Original error: ${e.message}`
        );
      }
      throw new Error(errorMessage);
    }
  }

  private async _startSession(caps: WindowsDriverCaps): Promise<void> {
    const {
      createSessionTimeout = DEFAULT_CREATE_SESSION_TIMEOUT_MS
    } = caps;
    this.log.debug(`Starting WinAppDriver session. Will timeout in '${createSessionTimeout}' ms.`);
    let retryIteration = 0;
    let lastError: Error | undefined;

    const condFn = async (): Promise<boolean> => {
      lastError = undefined;
      retryIteration++;
      try {
        await this.proxy?.command('/session', 'POST', {desiredCapabilities: caps});
        return true;
      } catch (error: any) {
        lastError = error;
        this.log.warn(`Could not start WinAppDriver session error = '${error.message}', attempt = ${retryIteration}`);
        return false;
      }
    };

    try {
      await waitForCondition(condFn, {
        waitMs: createSessionTimeout,
        intervalMs: 500
      });
    } catch (timeoutError: any) {
      this.log.debug(`timeoutError was ${timeoutError.message}`);
      if (lastError) {
        throw (lastError);
      }
      throw new Error(`Could not start WinAppDriver session within ${createSessionTimeout} ms.`);
    }
  }
}

export interface WADProcessOptions {
  base: string;
  port?: number;
  executablePath: string;
  isForceQuitEnabled: boolean;
}

export interface WinAppDriverOptions {
  port?: number;
  reqBasePath?: string;
  url?: string;
}

export type WindowsDriverCaps = {
  [K in keyof typeof desiredCapConstraints]?: any;
} & {
  'ms:forcequit'?: boolean;
  createSessionTimeout?: number;
  prerun?: {command?: string; script?: string};
  postrun?: {command?: string; script?: string};
}

