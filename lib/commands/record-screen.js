import _ from 'lodash';
import { waitForCondition } from 'asyncbox';
import { util, fs, net, system, tempDir } from 'appium/support';
import { SubProcess } from 'teen_process';
import B from 'bluebird';

const RETRY_PAUSE = 300;
const RETRY_TIMEOUT = 5000;
const DEFAULT_TIME_LIMIT = 60 * 10; // 10 minutes
const PROCESS_SHUTDOWN_TIMEOUT = 10 * 1000;
const DEFAULT_EXT = 'mp4';
const FFMPEG_BINARY = `ffmpeg${system.isWindows() ? '.exe' : ''}`;
const DEFAULT_FPS = 15;
const DEFAULT_PRESET = 'veryfast';


/**
 *
 * @param {string} localFile
 * @param {string?} remotePath
 * @param {Object} uploadOptions
 * @returns {Promise<string>}
 */
async function uploadRecordedMedia (localFile, remotePath = null, uploadOptions = {}) {
  if (_.isEmpty(remotePath) || !remotePath) {
    return (await util.toInMemoryBase64(localFile)).toString();
  }

  const {user, pass, method, headers, fileFieldName, formFields} = uploadOptions;
  const options = {
    method: method || 'PUT',
    headers,
    fileFieldName,
    formFields,
  };
  if (user && pass) {
    options.auth = {user, pass};
  }
  await net.uploadFile(localFile, remotePath, options);
  return '';
}

async function requireFfmpegPath () {
  try {
    return await fs.which(FFMPEG_BINARY);
  } catch {
    throw new Error(`${FFMPEG_BINARY} has not been found in PATH. ` +
      `Please make sure it is installed`);
  }
}

export class ScreenRecorder {
  /**
   * @param {string} videoPath
   * @param {import('@appium/types').AppiumLogger} log
   * @param {import('@appium/types').StringRecord} opts
   */
  constructor (videoPath, log, opts = {}) {
    this.log = log;
    this._videoPath = videoPath;
    this._process = null;
    this._fps = (opts.fps && opts.fps > 0) ? opts.fps : DEFAULT_FPS;
    this._audioInput = opts.audioInput;
    this._captureCursor = opts.captureCursor;
    this._captureClicks = opts.captureClicks;
    this._preset = opts.preset || DEFAULT_PRESET;
    this._videoFilter = opts.videoFilter;
    this._timeLimit = (opts.timeLimit && opts.timeLimit > 0)
      ? opts.timeLimit
      : DEFAULT_TIME_LIMIT;
  }

  async getVideoPath () {
    return (await fs.exists(this._videoPath)) ? this._videoPath : '';
  }

  isRunning () {
    return !!(this._process?.isRunning);
  }

  async _enforceTermination () {
    if (this._process && this.isRunning()) {
      this.log.debug('Force-stopping the currently running video recording');
      try {
        await this._process.stop('SIGKILL');
      } catch {}
    }
    this._process = null;
    const videoPath = await this.getVideoPath();
    if (videoPath) {
      await fs.rimraf(videoPath);
    }
    return '';
  }

  async start () {
    const ffmpeg = await requireFfmpegPath();

    const args = [
      '-loglevel', 'error',
      '-t', `${this._timeLimit}`,
      '-f', 'gdigrab',
      ...(this._captureCursor ? ['-capture_cursor', '1'] : []),
      ...(this._captureClicks ? ['-capture_mouse_clicks', '1'] : []),
      '-framerate', `${this._fps}`,
      '-i', 'desktop',
      ...(this._audioInput ? ['-f', 'dshow', '-i', `audio=${this._audioInput}`] : []),
      '-vcodec', 'libx264',
      '-preset', this._preset,
      '-tune', 'zerolatency',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-fflags', 'nobuffer',
      '-f', DEFAULT_EXT,
      '-r', `${this._fps}`,
      ...(this._videoFilter ? ['-filter:v', this._videoFilter] : []),
    ];

    const fullCmd = [
      ffmpeg,
      ...args,
      this._videoPath,
    ];
    this._process = new SubProcess(fullCmd[0], fullCmd.slice(1), {
      windowsHide: true,
    });
    this.log.debug(`Starting ${FFMPEG_BINARY}: ${util.quote(fullCmd)}`);
    this._process.on('output', (stdout, stderr) => {
      if (_.trim(stdout || stderr)) {
        this.log.debug(`[${FFMPEG_BINARY}] ${stdout || stderr}`);
      }
    });
    this._process.once('exit', async (code, signal) => {
      this._process = null;
      if (code === 0) {
        this.log.debug('Screen recording exited without errors');
      } else {
        await this._enforceTermination();
        this.log.warn(`Screen recording exited with error code ${code}, signal ${signal}`);
      }
    });
    await this._process.start(0);
    try {
      await waitForCondition(async () => {
        if (await this.getVideoPath()) {
          return true;
        }
        if (!this._process) {
          throw new Error(`${FFMPEG_BINARY} process died unexpectedly`);
        }
        return false;
      }, {
        waitMs: RETRY_TIMEOUT,
        intervalMs: RETRY_PAUSE,
      });
    } catch {
      await this._enforceTermination();
      throw this.log.errorWithException(
        `The expected screen record file '${this._videoPath}' does not exist. ` +
        `Check the server log for more details`
      );
    }
    this.log.info(`The video recording has started. Will timeout in ${util.pluralize('second', this._timeLimit, true)}`);
  }

  async stop (force = false) {
    if (force) {
      return await this._enforceTermination();
    }

    if (!this.isRunning()) {
      this.log.debug('Screen recording is not running. Returning the recent result');
      return await this.getVideoPath();
    }

    return new B((resolve, reject) => {
      const timer = setTimeout(async () => {
        await this._enforceTermination();
        reject(new Error(`Screen recording has failed to exit after ${PROCESS_SHUTDOWN_TIMEOUT}ms`));
      }, PROCESS_SHUTDOWN_TIMEOUT);

      this._process?.once('exit', async (code, signal) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(await this.getVideoPath());
        } else {
          reject(new Error(`Screen recording exited with error code ${code}, signal ${signal}`));
        }
      });

      this._process?.proc?.stdin?.write('q');
      this._process?.proc?.stdin?.end();
    });
  }
}

/**
 * Record the display in background while the automated test is running.
 * This method requires FFMPEG (https://www.ffmpeg.org/download.html) to be installed
 * and present in PATH.
 * The resulting video uses H264 codec and is ready to be played by media players built-in into web browsers.
 *
 * @this {WindowsDriver}
 * @param {string} [videoFilter] - The video filter spec to apply for ffmpeg.
 * See https://trac.ffmpeg.org/wiki/FilteringGuide for more details on the possible values.
 * Example: Set it to `scale=ifnot(gte(iw\,1024)\,iw\,1024):-2` in order to limit the video width
 * to 1024px. The height will be adjusted automatically to match the actual ratio.
 * @param {number|string} [fps=15] - The count of frames per second in the resulting video.
 * The greater fps it has the bigger file size is.
 * @param {string} [preset='veryfast'] - One of the supported encoding presets. Possible values are:
 * - ultrafast
 * - superfast
 * - veryfast
 * - faster
 * - fast
 * - medium
 * - slow
 * - slower
 * - veryslow
 * A preset is a collection of options that will provide a certain encoding speed to compression ratio.
 * A slower preset will provide better compression (compression is quality per filesize).
 * This means that, for example, if you target a certain file size or constant bit rate, you will achieve better
 * quality with a slower preset. Read https://trac.ffmpeg.org/wiki/Encode/H.264 for more details.
 * @param {boolean} [captureCursor=false] - Whether to capture the mouse cursor while recording
 * the screen
 * @param {boolean} [captureClicks=false] - Whether to capture mouse clicks while recording the
 * screen
 * @param {string} [audioInput] - If set then the given audio input will be used to record the computer audio
 * along with the desktop video. The list of available devices could be retrieved using
 * `ffmpeg -list_devices true -f dshow -i dummy` command.
 * @param {string|number} [timeLimit=600] - The maximum recording time, in seconds. The default
 * value is 600 seconds (10 minutes).
 * @param {boolean} [forceRestart=true] - Whether to ignore the call if a screen recording is currently running
 * (`false`) or to start a new recording immediately and terminate the existing one if running (`true`).
 * @throws {Error} If screen recording has failed to start or is not supported on the device under test.
 */
export async function windowsStartRecordingScreen (
  timeLimit,
  videoFilter,
  fps,
  preset,
  captureCursor,
  captureClicks,
  audioInput,
  forceRestart = true,
) {
  if (this._screenRecorder?.isRunning?.()) {
    this.log.debug('The screen recording is already running');
    if (!forceRestart) {
      this.log.debug('Doing nothing');
      return;
    }
    this.log.debug('Forcing the active screen recording to stop');
    await this._screenRecorder.stop(true);
  } else if (this._screenRecorder) {
    this.log.debug('Clearing the recent screen recording');
    await this._screenRecorder.stop(true);
  }
  this._screenRecorder = null;

  const videoPath = await tempDir.path({
    prefix: util.uuidV4().substring(0, 8),
    suffix: `.${DEFAULT_EXT}`,
  });
  this._screenRecorder = new ScreenRecorder(videoPath, this.log, {
    fps: parseInt(`${fps}`, 10),
    timeLimit: parseInt(`${timeLimit}`, 10),
    preset,
    captureCursor,
    captureClicks,
    videoFilter,
    audioInput,
  });
  try {
    await this._screenRecorder.start();
  } catch (e) {
    this._screenRecorder = null;
    throw e;
  }
}

/**
 * Stop recording the screen.
 * If no screen recording has been started before then the method returns an empty string.
 *
 * @this {WindowsDriver}
 * @param {string} [remotePath] - The path to the remote location, where the resulting video should be uploaded.
 * The following protocols are supported: http/https, ftp.
 * Null or empty string value (the default setting) means the content of resulting
 * file should be encoded as Base64 and passed as the endpoint response value.
 * An exception will be thrown if the generated media file is too big to
 * fit into the available process memory.
 * @param {string} [user] - The name of the user for the remote authentication.
 * @param {string} [pass] - The password for the remote authentication.
 * @param {string} [method] - The http multipart upload method name. The 'PUT' one is used by default.
 * @param {Object} [headers] - Additional headers mapping for multipart http(s) uploads
 * @param {string} [fileFieldName='file'] - The name of the form field, where the file content BLOB should be stored for
 *                                            http(s) uploads
 * @param {Object[]|[string, string][]} [formFields] - Additional form fields for multipart http(s) uploads
 * @returns {Promise<string>} Base64-encoded content of the recorded media file if 'remotePath'
 * parameter is falsy or an empty string.
 * @this {import('../driver').WindowsDriver}
 * @throws {Error} If there was an error while getting the name of a media file
 * or the file content cannot be uploaded to the remote location
 * or screen recording is not supported on the device under test.
 */
export async function windowsStopRecordingScreen (
  remotePath,
  user,
  pass,
  method,
  headers,
  fileFieldName,
  formFields,
) {
  if (!this._screenRecorder) {
    this.log.debug('No screen recording has been started. Doing nothing');
    return '';
  }

  this.log.debug('Retrieving the resulting video data');
  const videoPath = await this._screenRecorder.stop();
  if (!videoPath) {
    this.log.debug('No video data is found. Returning an empty string');
    return '';
  }
  if (_.isEmpty(remotePath)) {
    const {size} = await fs.stat(videoPath);
    this.log.debug(`The size of the resulting screen recording is ${util.toReadableSizeString(size)}`);
  }
  return await uploadRecordedMedia(videoPath, remotePath, {
    user,
    pass,
    method,
    headers,
    fileFieldName,
    formFields,
  });
}

/**
 * Record the display in background while the automated test is running.
 * This method requires FFMPEG (https://www.ffmpeg.org/download.html) to be installed
 * and present in PATH.
 * The resulting video uses H264 codec and is ready to be played by media players built-in into web browsers.
 *
 * @param {StartRecordingOptions} [options] - The available options.
 * @this {import('../driver').WindowsDriver}
 * @throws {Error} If screen recording has failed to start or is not supported on the device under test.
 */
export async function startRecordingScreen(options = {}) {
  const {
    timeLimit,
    videoFilter,
    fps,
    preset,
    captureCursor,
    captureClicks,
    audioInput,
    forceRestart = true,
  } = options;

  await this.windowsStartRecordingScreen(
    timeLimit,
    videoFilter,
    fps,
    preset,
    captureCursor,
    captureClicks,
    audioInput,
    forceRestart
  );
}

/**
 * Stop recording the screen.
 * If no screen recording has been started before then the method returns an empty string.
 *
 * @param {StopRecordingOptions} [options] - The available options.
 * @returns {Promise<string>} Base64-encoded content of the recorded media file if 'remotePath'
 * parameter is falsy or an empty string.
 * @this {import('../driver').WindowsDriver}
 * @throws {Error} If there was an error while getting the name of a media file
 * or the file content cannot be uploaded to the remote location
 * or screen recording is not supported on the device under test.
 */
export async function stopRecordingScreen(options = {}) {
  const {remotePath, user, pass, method, headers, fileFieldName, formFields} = options;

  return await this.windowsStopRecordingScreen(
    remotePath,
    user,
    pass,
    method,
    headers,
    fileFieldName,
    formFields
  );
}

/**
 * @typedef {import('../driver').WindowsDriver} WindowsDriver
 */

/**
 * For detailed explanations of each property,
 * please refer to the parameters of the {@linkcode windowsStartRecordingScreen} function.
 *
 * @typedef {Object} StartRecordingOptions
 *
 * @property {string} [videoFilter]
 * @property {number|string} [fps=15]
 * @property {string} [preset='veryfast']
 * @property {boolean} [captureCursor=false]
 * @property {boolean} [captureClicks=false]
 * @property {string} [audioInput]
 * @property {string|number} [timeLimit=600]
 * @property {boolean} [forceRestart=true]
 */

/**
 * For detailed explanations of each property,
 * please refer to the parameters of the {@linkcode windowsStopRecordingScreen} function.
 *
 * @typedef {Object} StopRecordingOptions
 *
 * @property {string} [remotePath]
 * @property {string} [user]
 * @property {string} [pass]
 * @property {string} [method]
 * @property {Object} [headers]
 * @property {string} [fileFieldName='file']
 * @property {Object[]|[string, string][]} [formFields]
 */