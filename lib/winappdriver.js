import _ from 'lodash';
import os from 'os';
import path from 'path';
import { JWProxy, errors } from 'appium-base-driver';
import log from './logger';
import { SubProcess } from 'teen_process';
import { WAD_INSTALL_PATH, isWADChecksumOk, isWADInstalled } from './installer';
import { waitForCondition } from 'asyncbox';
import { execSync } from 'child_process';
import { util } from 'appium-support';
import { findAPortNotInUse } from 'portscanner';


const DEFAULT_BASE = '/wd/hub';
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
  constructor (opts = {}) {
    this.base = opts.base;
    this.port = opts.port;
    this.proc = null;
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
        } catch (e) {
          log.errorAndThrow(
            `Could not find any free port in range ${startPort}..${endPort}. ` +
            `Please check your system firewall settings or set 'systemPort' capability ` +
            `to the desired port number`);
        }
      });
    }

    const args = [`${this.port}${this.base}`];
    this.proc = new SubProcess(WAD_INSTALL_PATH, args, {
      encoding: 'ucs2'
    });
    this.proc.on('output', (stdout, stderr) => {
      const line = _.trim(stderr || stdout);
      if (line) {
        log.debug(line);
      }
    });
    this.proc.on('exit', (code, signal) => {
      log.info(`WinAppDriver exited with code ${code}, signal ${signal}`);
    });
    log.info(`Spawning '${WAD_INSTALL_PATH}' with args: ${JSON.stringify(args)}`);
    await this.proc.start(0);
  }

  async stop () {
    if (this.isRunning) {
      try {
        await this.proc.stop();
      } catch (e) {
        log.warn(`WinAppDriver process with PID ${this.proc.pid} cannot be stopped. ` +
          `Original error: ${e.message}`);
      }
    }
  }
}

const RUNNING_PROCESS_IDS = [];
process.once('exit', () => {
  for (const pid of RUNNING_PROCESS_IDS) {
    const command = `taskkill.exe /PID ${pid}`;
    try {
      execSync(command);
    } catch (e) {
      log.warn(`WinAppDriver process with PID ${pid} cannot be cleaned up. ` +
        `Original error: ${e.message}`);
    }
  }
});

class WinAppDriver {
  constructor (opts = {}) {
    this.proxyPort = opts.port;

    this.process = null;
    this.proxy = null;
  }

  async start (caps) {
    if (!await isWADInstalled()) {
      throw new Error(`WinAppDriver binary could not be found at the expected path ` +
        `'${WAD_INSTALL_PATH}'. Make sure it is installed`);
    }
    if (!await isWADChecksumOk()) {
      log.warn('WinAppDriver exists, but the checksum did not match. Was it replaced manually?');
    }

    this.process = new WADProcess({
      // XXXYD TODO: would be better if WinAppDriver didn't require passing in /wd/hub as a param
      base: DEFAULT_BASE,
      port: this.proxyPort,
    });
    await this.process.start();

    this.proxy = new WADProxy({
      server: DEFAULT_HOST,
      port: this.process.port,
    });
    this.proxy.didProcessExit = false;
    this.process.proc.on('exit', () => {
      this.proxy.didProcessExit = true;
    });

    try {
      await waitForCondition(async () => {
        try {
          await this.proxy.command('/status', 'GET');
          return true;
        } catch (err) {
          if (this.proxy.didProcessExit) {
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
        throw new Error(`WinAppDriver server is not listening within ${STARTUP_TIMEOUT_MS}ms timeout. ` +
          `Make sure it could be started manually`);
      }
      throw e;
    }
    const pid = this.process.proc.pid;
    RUNNING_PROCESS_IDS.push(pid);
    this.process.proc.on('exit', () => void _.pull(RUNNING_PROCESS_IDS, pid));

    await this._startSession(caps);
  }

  async _startSession (desiredCapabilities) {
    const {
      createSessionTimeout = DEFAULT_CREATE_SESSION_TIMEOUT_MS
    } = desiredCapabilities;
    log.debug(`Starting WinAppDriver session. Will timeout in '${createSessionTimeout}' ms.`);
    let retryIteration = 0;
    let lastError;

    const condFn = async () => {
      lastError = null;
      retryIteration++;
      try {
        await this.proxy.command('/session', 'POST', {desiredCapabilities});
        return true;
      } catch (error) {
        lastError = error;
        log.warn(`Could not start WinAppDriver session error = '${error.message}', attempt = '${retryIteration}' from '${this.createSessionRetry}'`);
        return false;
      }
    };

    try {
      await waitForCondition(condFn, {
        waitMs: createSessionTimeout,
        intervalMs: 500
      });
    } catch (timeoutError) {
      log.debug(`timeoutError was ${timeoutError.message}`);
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
      log.debug('Deleting WinAppDriver server session');
      try {
        await this.proxy.command(`/session/${this.proxy?.sessionId}`, 'DELETE');
      } catch (err) {
        log.warn(`Did not get confirmation WinAppDriver deleteSession worked; ` +
          `Error was: ${err.message}`);
      }
    }

    await this.process.stop();
  }

  async sendCommand (url, method, body) {
    return await this.proxy.command(url, method, body);
  }
}

export { WinAppDriver };
export default WinAppDriver;
