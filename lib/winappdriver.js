import events from 'events';
import { JWProxy } from 'appium-base-driver';
import log from './logger';
import { SubProcess } from 'teen_process';
import { WAD_INSTALL_PATH, verifyWAD } from './installer';
import { retryInterval } from 'asyncbox';
import cp from 'child_process';
import B from 'bluebird';

const REQUIRED_PARAMS = []; // XXYD 1-5-2018: removed app from required params because you can alternatively use appTopLevelWindow
const DEFAULT_WAD_HOST = '127.0.0.1';
const DEFAULT_WAD_PORT = 4724; //  should be non-4723 to avoid conflict on the same box

class WinAppDriver extends events.EventEmitter {
  constructor (opts = {}) {
    const {host, port} = opts;
    super();

    for (let req of REQUIRED_PARAMS) {
      if (!opts || !opts[req]) {
        throw new Error(`Option '${req}' is required!`);
      }
      this[req] = opts[req];
    }

    this.proxyHost = host || DEFAULT_WAD_HOST;
    this.proxyPort = port || DEFAULT_WAD_PORT;
    this.proc = null;
    this.state = WinAppDriver.STATE_STOPPED;
    this.jwproxy = new JWProxy({server: this.proxyHost, port: this.proxyPort});
  }

  async start () {
    if (!await verifyWAD()) {
      throw new Error("Could not verify WinAppDriver install; re-run install");
    }
        
    this.changeState(WinAppDriver.STATE_STARTING);
    
    // XXXYD TODO: would be better if WinAppDriver didn't require passing in /wd/hub as a param
    let args = [this.proxyPort + "/wd/hub"];

    const startDetector = (stdout) => {
      return stdout.indexOf("listening for requests") !== -1;        
    };

    let processIsAlive = false;
    try {
      await this.killAll();

      // set up our subprocess object
      this.proc = new SubProcess(WAD_INSTALL_PATH, args, {
        encoding: 'ucs2'
      });
      processIsAlive = true;

      // handle log output
      for (let stream of ['STDOUT', 'STDERR']) {
        this.proc.on(`lines-${stream.toLowerCase()}`, (lines) => {
          for (let l of lines) {
            log.info(`[${stream}] ${l.trim()}`);
          }
        });
      }

      // handle out-of-bound exit by simply emitting a stopped state
      this.proc.on('exit', (code, signal) => {
        processIsAlive = false;
        if (this.state !== WinAppDriver.STATE_STOPPED &&
            this.state !== WinAppDriver.STATE_STOPPING) {
          let msg = `WinAppDriver exited unexpectedly with code ${code}, ` +
                    `signal ${signal}`;
          log.error(msg);
          this.changeState(WinAppDriver.STATE_STOPPED);
        }
      });
      log.info(`Spawning winappdriver with: ${args.join(' ')}`);

      // start subproc and wait for startDetector
      await this.proc.start(startDetector);
      await this.waitForOnline();

    } catch (e) {
      this.emit(WinAppDriver.EVENT_ERROR, e);
      // just because we had an error doesn't mean the winappdriver process
      // finished; we should clean up if necessary
      if (processIsAlive) {
        await this.proc.stop();
      }
      log.errorAndThrow(e);
    }
  }      

  sessionId () {
    if (this.state !== WinAppDriver.STATE_ONLINE) {
      return null;
    }

    return this.jwproxy.sessionId;
  }

  async waitForOnline () {

    // we need to make sure WAD hasn't crashed
    let winappdriverStopped = false;
    await retryInterval(20, 200, async () => {
      if ([WinAppDriver.STATE_STOPPED, WinAppDriver.STATE_ONLINE].indexOf(this.state) >= 0) {
        // we are either stopped, stopping, or we're online
        winappdriverStopped = this.state === WinAppDriver.STATE_STOPPED;
        return;
      }

      if (await this.getStatus()) {
        this.changeState(WinAppDriver.STATE_ONLINE);
      }
    });

    if (winappdriverStopped) {
      throw new Error('WinAppDriver crashed during startup.');
    }
  }

  async getStatus () {
    const resBlock = await this.jwproxy.proxy('/status', 'GET');
    if (resBlock[0].statusCode === 200){
        log.info(`Status call returned 200. we're online and ready to run tests`);
        return true;
     }
     return false;
  }

  async startSession (caps) {
    this.proxyReqRes = this.jwproxy.proxyReqRes.bind(this.jwproxy);
    await this.jwproxy.command('/session', 'POST', {desiredCapabilities: caps});
  }

  async stop (emitStates = true) {
    if (emitStates) {
      this.changeState(WinAppDriver.STATE_STOPPING);
    }
    try {
      if (this.proc) {
        await this.proc.stop();
      }
      if (emitStates) {
        this.changeState(WinAppDriver.STATE_STOPPED);
      }
    } catch (e) {
      log.error(e);
    }
  }

  changeState (state) {
    this.state = state;
    log.debug(`WinAppDriver changed state to '${state}'`);
    this.emit(WinAppDriver.EVENT_CHANGED, {state});
  }

  async sendCommand (url, method, body) {
    return await this.jwproxy.command(url, method, body);
  }

  async proxyReq (req, res) {
    return await this.jwproxy.proxyReqRes(req, res);
  }

  async killAll () {
    let cmd;
    // js hint cannot handle backticks, even escaped, within template literals
    cmd = "FOR /F \"usebackq tokens=5\" %a in (`netstat -nao ^| " +
          "findstr /R /C:\"" + this.proxyPort + " \"`) do (" +
          "FOR /F \"usebackq\" %b in (`TASKLIST /FI \"PID eq %a\" ^| " +
          "findstr /I winappdriver.exe`) do (IF NOT %b==\"\" TASKKILL " +
          "/F /PID %a))";
    log.info(`Killing any old WinAppDrivers on same port, running: ${cmd}`);
    try {
      // use cp.exec instead of teen process because of crazy windows quoting
      await (B.promisify(cp.exec))(cmd);
      log.info("Successfully cleaned up old WinAppDrivers");
    } catch (err) {
      log.info("No old WinAppDrivers seemed to exist");
    }
  }

  async deleteSession () {
    log.debug('Deleting WinAppDriver server session');
    // rely on jwproxy's intelligence to know what we're talking about and
    // delete the current session
    try {
      await this.jwproxy.command('/', 'DELETE');
    } catch (err) {
      log.warn(`Did not get confirmation WinAppDriver deleteSession worked; ` +
        `Error was: ${err}`);
    }
  }
}

WinAppDriver.EVENT_ERROR = 'winappdriver_error';
WinAppDriver.EVENT_CHANGED = 'stateChanged';
WinAppDriver.STATE_STOPPED = 'stopped';
WinAppDriver.STATE_STARTING = 'starting';
WinAppDriver.STATE_ONLINE = 'online';
WinAppDriver.STATE_STOPPING = 'stopping';

export { WinAppDriver, DEFAULT_WAD_HOST, DEFAULT_WAD_PORT};
export default WinAppDriver;
