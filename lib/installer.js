import _ from 'lodash';
import { system, fs, util, net, tempDir } from 'appium-support';
import path from 'path';
import { exec } from 'teen_process';
import log from './logger';
import ES6Error from 'es6-error';


const WAD_VER = '1.2-RC';
const WAD_DOWNLOAD_LINK = `https://github.com/Microsoft/WinAppDriver/releases/download/v${WAD_VER}/WindowsApplicationDriver.msi`;
const WAD_DOWNLOAD_MD5 = 'dbaa9a3f7416c2b73cc5cd0e7452c8d0';
const WAD_DOWNLOAD_TIMEOUT_MS = 60000;
const POSSIBLE_WAD_INSTALL_ROOTS = [
  process.env['ProgramFiles(x86)'],
  process.env.ProgramFiles,
  `${process.env.SystemDrive || 'C:'}\\\\Program Files`,
];
const WAD_EXE_NAME = 'WinAppDriver.exe';
const WAD_EXE_MD5 = '50d694ebfaa622ef7e4061c1bf52efe6';
// const WAD_GUID = 'DDCD58BF-37CF-4758-A15E-A60E7CF20E41';

class WADNotFoundError extends ES6Error {}

const getWADExecutablePath = _.memoize(async function getWADInstallPath () {
  // TODO: WAD installer should write the full path to it into the system registry
  const pathCandidates = POSSIBLE_WAD_INSTALL_ROOTS
    // remove unset env variables
    .filter(Boolean)
    // construct full path
    .map((root) => path.resolve(root, 'Windows Application Driver', WAD_EXE_NAME));
  for (const result of pathCandidates) {
    if (await fs.exists(result)) {
      return result;
    }
  }
  throw new WADNotFoundError(`${WAD_EXE_NAME} has not been found in any of these ` +
    `locations: ${pathCandidates}. Is it installed?`);
});

async function downloadWAD () {
  const tempFile = path.resolve(await tempDir.staticDir(), `${util.uuidV4()}.msi`);

  // actually download the msi file
  log.info(`Downloading ${WAD_DOWNLOAD_LINK} to '${tempFile}'`);
  await net.downloadFile(WAD_DOWNLOAD_LINK, tempFile, {timeout: WAD_DOWNLOAD_TIMEOUT_MS});

  // validate checksum
  const downloadedMd5 = await fs.md5(tempFile);
  if (downloadedMd5 !== WAD_DOWNLOAD_MD5) {
    throw new Error(`Checksum validation error: expected ${WAD_DOWNLOAD_MD5} but got ${downloadedMd5}`);
  }

  return tempFile;
}

async function installWAD (msiPath) {
  log.info(`Running MSI installer`);
  await exec('msiexec', ['/i', msiPath, '/qn']);
}

async function isWADChecksumOk (executablePath) {
  return await fs.md5(executablePath) === WAD_EXE_MD5;
}

const isAdmin = _.memoize(async function isAdmin () {
  try {
    await exec('fsutil.exe', ['dirty', 'query', process.env.SystemDrive || 'C:']);
    return true;
  } catch (ign) {
    return false;
  }
});

async function setupWAD () {
  if (!system.isWindows()) {
    throw new Error(`Can only download WinAppDriver on Windows!`);
  }

  try {
    const executablePath = await getWADExecutablePath();
    if (await isWADChecksumOk(executablePath)) {
      log.info(`WinAppDriver version ${WAD_VER} already exists with correct checksum, not re-downloading`);
    } else {
      log.warn('WinAppDriver exists, but the checksum did not match. Not re-downloading. ' +
        'Was it replaced manually?');
    }
    return;
  } catch (e) {
    if (!(e instanceof WADNotFoundError)) {
      throw e;
    }
    log.info(`WinAppDriver doesn't exist, setting up`);
  }

  if (!await isAdmin()) {
    throw new Error(`You are not running as an administrator so WinAppDriver cannot be installed for you; please reinstall as admin`);
  }

  const msiPath = await downloadWAD();
  try {
    await installWAD(msiPath);
  } finally {
    await fs.rimraf(msiPath);
  }
}

export {
  downloadWAD, setupWAD, isWADChecksumOk, installWAD,
  getWADExecutablePath, isAdmin,
};
export default setupWAD;
