import _ from 'lodash';
import { system, fs, util, net } from 'appium-support';
import path from 'path';
import { exec } from 'teen_process';
import log from './logger';
import os from 'os';


const WAD_VER = '1.2-RC';
const WAD_DL = `https://github.com/Microsoft/WinAppDriver/releases/download/v${WAD_VER}/WindowsApplicationDriver.msi`;
const WAD_DL_MD5 = 'dbaa9a3f7416c2b73cc5cd0e7452c8d0';
const WAD_TIMEOUT = 5000; //ms

const WAD_INSTALL_PATH = path.resolve(
  process.env['ProgramFiles(x86)'] || process.env.ProgramFiles || 'C:\\\\Program Files',
  'Windows Application Driver', 'WinAppDriver.exe');
const WAD_EXE_MD5 = '50d694ebfaa622ef7e4061c1bf52efe6';
const WAD_GUID = 'DDCD58BF-37CF-4758-A15E-A60E7CF20E41';

async function downloadWAD () {
  const tempFile = path.resolve(os.tmpdir(), `${util.uuidV4()}.msi`);

  // actually download the msi file
  log.info(`Downloading ${WAD_DL} to '${tempFile}'`);
  await net.downloadFile(WAD_DL, tempFile, {timeout: WAD_TIMEOUT});

  // validate checksum
  const downloadedMd5 = await fs.md5(tempFile);
  if (downloadedMd5 !== WAD_DL_MD5) {
    throw new Error(`Checksum validation error: expected ${WAD_DL_MD5} but got ${downloadedMd5}`);
  }

  return tempFile;
}

async function installWAD (msiPath) {
  log.info(`Running MSI installer...`);
  await exec('msiexec', ['/i', msiPath, '/qn']);
}

async function isWADInstalled () {
  return await fs.exists(WAD_INSTALL_PATH);
}

async function isWADChecksumOk () {
  return await fs.md5(WAD_INSTALL_PATH) === WAD_EXE_MD5;
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

  if (await isWADInstalled()) {
    if (await isWADChecksumOk()) {
      log.info(`WinAppDriver version ${WAD_VER} already exists with correct checksum, not re-downloading`);
    } else {
      log.warn('WinAppDriver exists, but the checksum did not match. Not re-downloading. ' +
        'Was it replaced manually?');
    }
    return;
  }

  log.info(`WinAppDriver doesn't exist, setting up`);

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
  downloadWAD, setupWAD, isWADInstalled, isWADChecksumOk, installWAD,
  WAD_INSTALL_PATH, WAD_GUID, isAdmin,
};
export default setupWAD;
