import _ from 'lodash';
import os from 'os';
import path from 'path';
import { JWProxy, errors } from 'appium/driver';
import { SubProcess } from 'teen_process';
import { getWADExecutablePath } from './installer';
import { waitForCondition } from 'asyncbox';
import { execSync } from 'child_process';
import { util } from 'appium/support';
import { findAPortNotInUse } from 'portscanner';


const DEFAULT_BASE_PATH = '/wd/hub';
const DEFAULT_HOST = '127.0.0.1';
const WAD_PORT_RANGE = [4724, 4824];
const STARTUP_TIMEOUT_MS = 10000;
const DEFAULT_CREATE_SESSION_TIMEOUT_MS = 20000; // retry start session creation during the timeout in milliseconds
// The guard is needed to avoid dynamic system port allocation conflicts for
// parallel driver sessions
const PORT_ALLOCATION_GUARD = util.getLockFileGuard(path.resolve(os.tmpdir(), 'wad_port_guard'), {
  timeout: 5,
  tryRecovery: true,
});

class WADProxy extends JWProxy {
  /** @type {boolean|undefined} */
  didProcessExit;

  /**
   * @override
   */
  async proxyCommand (url, method, body = null) {
    if (this.didProcessExit) {
      throw new errors.InvalidContextError(
        `'${method} ${url}' cannot be proxied to WinAppDriver server because ` +
        'its process is not running (probably crashed). Check the Appium log for more details');
    }
    return await super.proxyCommand(url, method, body);
  }
}

class WADProcess {
  /**
   *
   * @param {import('@appium/types').AppiumLogger} log
   * @param {WADProcessOptions} opts
   */
  constructor (log, opts) {
    this.log = log;
    this.base = opts.base;
    this.port = opts.port;
    this.executablePath = opts.executablePath;
    this.proc = null;
    this.isForceQuitEnabled = opts.isForceQuitEnabled;
  }

  get isRunning () {
    return !!(this.proc?.isRunning);
  }

  async start () {
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

  async stop () {
    if (this.isRunning) {
      try {
        await this.proc?.stop();
      } catch (e) {
        this.log.warn(`WinAppDriver process with PID ${this.proc?.pid} cannot be stopped. ` +
          `Original error: ${e.message}`);
      }
    }
  }
}

const RUNNING_PROCESS_IDS = [];
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
  /**
   *
   * @param {import('@appium/types').AppiumLogger} log
   * @param {WinAppDriverOptions} opts
   */
  constructor (log, opts) {
    this.log = log;
    this.opts = opts;

    this.process = null;
    this.proxy = null;
  }

  /**
   * @param {WindowsDriverCaps} caps
   */
  async start (caps) {
    if (this.opts.url) {
      await this._prepareSessionWithCustomServer(this.opts.url);
    } else {
      const isForceQuitEnabled = caps['ms:forcequit'] === true;
      await this._prepareSessionWithBuiltInServer(isForceQuitEnabled);
    }

    await this._startSession(caps);
  }

  /**
   * @param {boolean} isForceQuitEnabled
   * @returns {Promise<void>}
   */
  async _prepareSessionWithBuiltInServer(isForceQuitEnabled) {
    const executablePath = await getWADExecutablePath();
    this.process = new WADProcess(this.log, {
      base: DEFAULT_BASE_PATH,
      port: this.opts.port,
      executablePath,
      isForceQuitEnabled,
    });
    await this.process.start();

    /** @type {import('@appium/types').ProxyOptions} */
    const proxyOpts = {
      log: this.log,
      base: this.process.base,
      server: DEFAULT_HOST,
      port: this.process.port,
    };
    if (this.opts.reqBasePath) {
      proxyOpts.reqBasePath = this.opts.reqBasePath;
    }
    this.proxy = new WADProxy(proxyOpts);
    this.proxy.didProcessExit = false;
    this.process.proc?.on('exit', () => {
      if (this.proxy) {
        this.proxy.didProcessExit = true;
      }
    });

    try {
      await waitForCondition(async () => {
        try {
          if (this.proxy) {
            await this.proxy.command('/status', 'GET');
            return true;
          }
        } catch (err) {
          if (this.proxy?.didProcessExit) {
            throw new Error(err.message);
          }
          return false;
        }
      }, {
        waitMs: STARTUP_TIMEOUT_MS,
        intervalMs: 1000,
      });
    } catch (e) {
      if (/Condition unmet/.test(e.message)) {
        throw new Error(
          `WinAppDriver server is not listening within ${STARTUP_TIMEOUT_MS}ms timeout. ` +
          `Make sure it could be started manually`
        );
      }
      throw e;
    }
    const pid = this.process.proc?.pid;
    RUNNING_PROCESS_IDS.push(pid);
    this.process.proc?.on('exit', () => void _.pull(RUNNING_PROCESS_IDS, pid));
  }

  /**
   *
   * @param {string} url
   * @returns {Promise<void>}
   */
  async _prepareSessionWithCustomServer (url) {
    this.log.info(`Using custom WinAppDriver server URL: ${url}`);

    /** @type {URL} */
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      throw new Error(
        `Cannot parse the provided WinAppDriver URL '${url}'. Original error: ${e.message}`
      );
    }
    /** @type {import('@appium/types').ProxyOptions} */
    const proxyOpts = {
      log: this.log,
      base: _.trimEnd(parsedUrl.pathname, '/'),
      server: parsedUrl.hostname,
      port: parseInt(parsedUrl.port, 10),
      scheme: _.trimEnd(parsedUrl.protocol, ':'),
    };
    if (this.opts.reqBasePath) {
      proxyOpts.reqBasePath = this.opts.reqBasePath;
    }
    this.proxy = new WADProxy(proxyOpts);

    try {
      await this.proxy.command('/status', 'GET');
    } catch {
      throw new Error(
        `WinAppDriver server is not listening at ${url}. ` +
        `Make sure it is running and the provided wadUrl is correct`
      );
    }
  }

  /**
   * @param {WindowsDriverCaps} caps
   */
  async _startSession (caps) {
    const {
      createSessionTimeout = DEFAULT_CREATE_SESSION_TIMEOUT_MS
    } = caps;
    this.log.debug(`Starting WinAppDriver session. Will timeout in '${createSessionTimeout}' ms.`);
    let retryIteration = 0;
    let lastError;

    const condFn = async () => {
      lastError = null;
      retryIteration++;
      try {
        await this.proxy?.command('/session', 'POST', {desiredCapabilities: caps});
        return true;
      } catch (error) {
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
    } catch (timeoutError) {
      this.log.debug(`timeoutError was ${timeoutError.message}`);
      if (lastError) {
        throw (lastError);
      }
      throw new Error(`Could not start WinAppDriver session within ${createSessionTimeout} ms.`);
    }
  }

  async stop () {
    if (!this.process?.isRunning) {
      return;
    }

    if (this.proxy?.sessionId) {
      this.log.debug('Deleting WinAppDriver server session');
      try {
        await this.proxy.command('', 'DELETE');
      } catch (err) {
        this.log.warn(`Did not get confirmation WinAppDriver deleteSession worked; ` +
          `Error was: ${err.message}`);
      }
    }

    await this.process.stop();
  }

  async sendCommand (url, method, body) {
    return await this.proxy?.command(url, method, body);
  }
}

export default WinAppDriver;

/**
 * @typedef {Object} WinAppDriverOptions
 * @property {number} [port]
 * @property {string} [reqBasePath]
 * @property {string} [url]
 */

/**
 * @typedef {Object} WADProcessOptions
 * @property {string} base
 * @property {number} [port]
 * @property {string} executablePath
 * @property {boolean} isForceQuitEnabled
 */

/**
 * @typedef {import('@appium/types').DriverCaps<import('./driver').WindowsDriverConstraints>} WindowsDriverCaps
 */
