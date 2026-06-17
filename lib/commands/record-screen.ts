import {waitForCondition} from 'asyncbox';
import {util, fs, net, system, tempDir} from 'appium/support.js';
import {isEmpty} from '../utils/index.js';
import {SubProcess} from 'teen_process';
import type {AppiumLogger} from '@appium/types';
import type {WindowsDriver} from '../driver.js';

const RETRY_PAUSE = 300;
const RETRY_TIMEOUT = 5000;
const DEFAULT_TIME_LIMIT = 60 * 10; // 10 minutes
const PROCESS_SHUTDOWN_TIMEOUT = 10 * 1000;
const DEFAULT_EXT = 'mp4';
const FFMPEG_BINARY = `ffmpeg${system.isWindows() ? '.exe' : ''}`;
const DEFAULT_FPS = 15;
const DEFAULT_PRESET = 'veryfast';

export interface StartRecordingOptions {
  videoFilter?: string;
  fps?: number | string;
  preset?: string;
  captureCursor?: boolean;
  captureClicks?: boolean;
  audioInput?: string;
  timeLimit?: string | number;
  forceRestart?: boolean;
}

export interface StopRecordingOptions {
  remotePath?: string;
  user?: string;
  pass?: string;
  method?: string;
  headers?: Record<string, string>;
  fileFieldName?: string;
  formFields?: Array<Record<string, string>> | [string, string][];
}

interface ScreenRecorderOptions {
  fps?: number;
  audioInput?: string;
  captureCursor?: boolean;
  captureClicks?: boolean;
  preset?: string;
  videoFilter?: string;
  timeLimit?: number;
}

interface UploadOptions extends StopRecordingOptions {
  auth?: {user: string; pass: string};
}

export class ScreenRecorder {
  private readonly log: AppiumLogger;
  private readonly _videoPath: string;
  private _process: SubProcess | null;
  private readonly _fps: number;
  private readonly _audioInput?: string;
  private readonly _captureCursor?: boolean;
  private readonly _captureClicks?: boolean;
  private readonly _preset: string;
  private readonly _videoFilter?: string;
  private readonly _timeLimit: number;

  constructor(videoPath: string, log: AppiumLogger, opts: ScreenRecorderOptions = {}) {
    this.log = log;
    this._videoPath = videoPath;
    this._process = null;
    this._fps = opts.fps && opts.fps > 0 ? opts.fps : DEFAULT_FPS;
    this._audioInput = opts.audioInput;
    this._captureCursor = opts.captureCursor;
    this._captureClicks = opts.captureClicks;
    this._preset = opts.preset || DEFAULT_PRESET;
    this._videoFilter = opts.videoFilter;
    this._timeLimit = opts.timeLimit && opts.timeLimit > 0 ? opts.timeLimit : DEFAULT_TIME_LIMIT;
  }

  async getVideoPath(): Promise<string> {
    return (await fs.exists(this._videoPath)) ? this._videoPath : '';
  }

  isRunning() {
    return !!this._process?.isRunning;
  }

  async _enforceTermination() {
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

  async start() {
    const ffmpeg = await requireFfmpegPath();

    const args = [
      '-loglevel',
      'error',
      '-t',
      `${this._timeLimit}`,
      '-f',
      'gdigrab',
      ...(this._captureCursor ? ['-capture_cursor', '1'] : []),
      ...(this._captureClicks ? ['-capture_mouse_clicks', '1'] : []),
      '-framerate',
      `${this._fps}`,
      '-i',
      'desktop',
      ...(this._audioInput ? ['-f', 'dshow', '-i', `audio=${this._audioInput}`] : []),
      '-vcodec',
      'libx264',
      '-preset',
      this._preset,
      '-tune',
      'zerolatency',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-fflags',
      'nobuffer',
      '-f',
      DEFAULT_EXT,
      '-r',
      `${this._fps}`,
      ...(this._videoFilter ? ['-filter:v', this._videoFilter] : []),
    ];

    const fullCmd = [ffmpeg, ...args, this._videoPath];
    this._process = new SubProcess(fullCmd[0], fullCmd.slice(1), {
      windowsHide: true,
    });
    this.log.debug(`Starting ${FFMPEG_BINARY}: ${util.quote(fullCmd)}`);
    this._process.on('output', (stdout, stderr) => {
      if (String(stdout || stderr).trim()) {
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
      await waitForCondition(
        async () => {
          if (await this.getVideoPath()) {
            return true;
          }
          if (!this._process) {
            throw new Error(`${FFMPEG_BINARY} process died unexpectedly`);
          }
          return false;
        },
        {
          waitMs: RETRY_TIMEOUT,
          intervalMs: RETRY_PAUSE,
        },
      );
    } catch {
      await this._enforceTermination();
      throw this.log.errorWithException(
        `The expected screen record file '${this._videoPath}' does not exist. ` +
          `Check the server log for more details`,
      );
    }
    this.log.info(
      `The video recording has started. Will timeout in ${util.pluralize('second', this._timeLimit, true)}`,
    );
  }

  async stop(force = false): Promise<string> {
    if (force) {
      return await this._enforceTermination();
    }

    if (!this.isRunning()) {
      this.log.debug('Screen recording is not running. Returning the recent result');
      return await this.getVideoPath();
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(async () => {
        await this._enforceTermination();
        reject(
          new Error(`Screen recording has failed to exit after ${PROCESS_SHUTDOWN_TIMEOUT}ms`),
        );
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
 * Records the desktop in the background while the automated test runs.
 *
 * Requires [FFmpeg](https://www.ffmpeg.org/download.html) on PATH. Output is H.264 in an MP4 container suitable for
 * typical in-browser playback.
 *
 * @param timeLimit The maximum recording time, in seconds. Default is 10 minutes.
 * @param videoFilter The video filter spec to apply for ffmpeg.
 * See the FFmpeg filtering guide for supported values.
 * @param fps The number of frames per second in the resulting video.
 * Higher values produce larger files.
 * @param preset One of the supported x264 encoding presets.
 * (For example ultrafast through veryslow; see the FFmpeg H.264 encoding guide.)
 * @param captureCursor Whether to capture the mouse cursor while recording.
 * @param captureClicks Whether to capture mouse clicks while recording.
 * @param audioInput Optional DirectShow audio device name to record alongside the desktop video.
 * @param forceRestart Whether to stop any in-progress recording before starting a new one.
 * @throws If recording cannot be started or is unsupported on this host.
 */
export async function windowsStartRecordingScreen(
  this: WindowsDriver,
  timeLimit?: string | number,
  videoFilter?: string,
  fps?: string | number,
  preset?: string,
  captureCursor?: boolean,
  captureClicks?: boolean,
  audioInput?: string,
  forceRestart = true,
): Promise<void> {
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
 * Stops the current screen recording and returns the result.
 *
 * When no recording was started, returns an empty string. When no remote upload URL is given, the recorded file
 * is read into memory and returned as Base64 in the response; very large files may exhaust process memory.
 * When a remote URL is given, the file is uploaded over HTTP(S) or FTP using the optional credentials, HTTP
 * method, headers, multipart field name, and extra form fields.
 *
 * @param remotePath The path to the remote location where the resulting video should be uploaded.
 * Supported protocols: `http/https`, `ftp`.
 * If `remotePath` is empty, the result is returned as Base64.
 * @param user The remote authentication username.
 * @param pass The remote authentication password.
 * @param method The multipart upload method (defaults to `PUT`).
 * @param headers Additional headers mapping for multipart HTTP(S) uploads.
 * @param fileFieldName The name of the form field holding the uploaded file content.
 * @param formFields Additional form fields for multipart HTTP(S) uploads.
 *
 * @throws If the recording cannot be read, the upload fails, or recording is unsupported.
 */
export async function windowsStopRecordingScreen(
  this: WindowsDriver,
  remotePath?: string,
  user?: string,
  pass?: string,
  method?: string,
  headers?: Record<string, string>,
  fileFieldName?: string,
  formFields?: Array<Record<string, string>> | [string, string][],
): Promise<string> {
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
  if (isEmpty(remotePath)) {
    const {size} = await fs.stat(videoPath);
    this.log.debug(
      `The size of the resulting screen recording is ${util.toReadableSizeString(size)}`,
    );
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
 * W3C-style entry point for starting a screen recording; delegates to {@link windowsStartRecordingScreen}.
 *
 * @param options - Recording options (same fields as the positional `windowsStartRecordingScreen` API).
 * @throws If recording cannot be started or is unsupported on this host.
 */
export async function startRecordingScreen(
  this: WindowsDriver,
  options: StartRecordingOptions = {},
): Promise<void> {
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
    forceRestart,
  );
}

/**
 * W3C-style entry point for stopping a screen recording; delegates to {@link windowsStopRecordingScreen}.
 *
 * @param options - Upload and auth options (same fields as the positional `windowsStopRecordingScreen` API).
 * @throws If the recording cannot be read, the upload fails, or recording is unsupported.
 */
export async function stopRecordingScreen(
  this: WindowsDriver,
  options: StopRecordingOptions = {},
): Promise<string> {
  const {remotePath, user, pass, method, headers, fileFieldName, formFields} = options;

  return await this.windowsStopRecordingScreen(
    remotePath,
    user,
    pass,
    method,
    headers,
    fileFieldName,
    formFields,
  );
}

async function uploadRecordedMedia(
  localFile: string,
  remotePath: string | null = null,
  uploadOptions: UploadOptions = {},
): Promise<string> {
  if (isEmpty(remotePath)) {
    return (await util.toInMemoryBase64(localFile)).toString();
  }

  const uploadUrl = remotePath as string;
  const {user, pass, method, headers, fileFieldName, formFields} = uploadOptions;
  const options: UploadOptions = {
    method: method || 'PUT',
    headers,
    fileFieldName,
    formFields,
  };
  if (user && pass) {
    options.auth = {user, pass};
  }
  await net.uploadFile(localFile, uploadUrl, options);
  return '';
}

async function requireFfmpegPath() {
  try {
    return await fs.which(FFMPEG_BINARY);
  } catch {
    throw new Error(
      `${FFMPEG_BINARY} has not been found in PATH. ` + `Please make sure it is installed`,
    );
  }
}
