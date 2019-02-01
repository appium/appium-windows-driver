import request from 'request-promise';
import { system, fs } from 'appium-support';
import path from 'path';
import { exec } from 'teen_process';
import log from './logger';

const WAD_VER = '1.1';
const WAD_DL = `https://github.com/Microsoft/WinAppDriver/releases/download/v${WAD_VER}/WindowsApplicationDriver.msi`;
const WAD_DL_MD5 = '1105548ca82ea32fb7be9ca4ea21ea58';

let WAD_INSTALL_PATH = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles || 'C:\\Program Files';
WAD_INSTALL_PATH = path.resolve(WAD_INSTALL_PATH, 'Windows Application Driver',
                                'WinAppDriver.exe');
const WAD_EXE_MD5 = '2d1b2adfb7b8d86fd890e260c1400ab7';
const WAD_GUID = 'DDCD58BF-37CF-4758-A15E-A60E7CF20E41';

async function downloadWAD () {
  log.info(`Opening temp file to write WinAppDriver to...`);
  let tempFile = path.resolve(process.env.TEMP, 'WinAppDriver.msi');
  log.info(`Will write to ${tempFile}`);

  // actually download the msi file
  log.info(`Downloading ${WAD_DL}...`);
  let body = await request.get({url: WAD_DL, encoding: 'binary'});
  log.info(`Writing binary content to ${tempFile}...`);
  await fs.writeFile(tempFile, body, {encoding: 'binary'});

  // validate checksum
  let downloadedMd5 = await fs.md5(tempFile);
  if (downloadedMd5 !== WAD_DL_MD5) {
    throw new Error(`Checksum validation error: expected ${WAD_DL_MD5} but ` +
                    `got ${downloadedMd5}`);
  }

  return tempFile;
}

async function installWAD (msiPath) {
  log.info(`Running MSI installer...`);
  await exec('msiexec', ['/i', msiPath, '/qn']);
}

async function verifyWAD () {
  log.info(`You must use WinAppDriver version ${WAD_VER}`);
  log.info(`Verifying WinAppDriver version ${WAD_VER} is installed via comparing the checksum.`);
  return await fs.exists(WAD_INSTALL_PATH) &&
         await fs.md5(WAD_INSTALL_PATH) === WAD_EXE_MD5;
}

async function isAdmin () {
  let testFilePath = path.resolve('/', 'Windows', 'System32', 'wad-test.txt');
  try {
    await fs.rimraf(testFilePath);
    await fs.writeFile(testFilePath, 'foo');
    return true;
  } catch (ign) {
    return false;
  }
}

async function setupWAD () {
  if (!system.isWindows()) {
    throw new Error(`Can only download WinAppDriver on Windows!`);
  }

  if (await verifyWAD()) {
    log.info(`WinAppDriver.exe version ${WAD_VER} already exists with correct checksum, not re-downloading`);
    return;
  }

  log.info(`WinAppDriver.exe doesn't exist at the correct version ${WAD_VER}, setting up`);

  if (!await isAdmin()) {
    throw new Error(`WARNING: You are not running as an administrator so WinAppDriver cannot be installed for you; please reinstall as admin`);
  }

  const msiPath = await downloadWAD();
  await installWAD(msiPath);
  if (!await verifyWAD()) {
    throw new Error(`Installed version of WinAppDriver failed checksum check`);
  }
}

export {
  downloadWAD, setupWAD, verifyWAD, installWAD, WAD_INSTALL_PATH, WAD_GUID,
};
export default setupWAD;
