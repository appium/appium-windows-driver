import _ from 'lodash';
import { system, fs, net, tempDir } from 'appium-support';
import path from 'path';
import { exec } from 'teen_process';
import log from './logger';
import ES6Error from 'es6-error';


const WAD_VER = '1.2.99';
const WAD_DOWNLOAD_MD5 = Object.freeze({
  x32: '23745e6ed373bc969ff7c4493e32756a',
  x64: '2923fc539f389d47754a7521ee50108e',
  arm64: 'b9af4222a3fb0d688ecfbf605d1c4500',
});
const ARCH_MAPPING = Object.freeze({x32: 'x86', x64: 'x64', arm64: 'arm64'});
const WAD_DOWNLOAD_TIMEOUT_MS = 60000;
const POSSIBLE_WAD_INSTALL_ROOTS = [
  process.env['ProgramFiles(x86)'],
  process.env.ProgramFiles,
  `${process.env.SystemDrive || 'C:'}\\\\Program Files`,
];
const WAD_EXE_NAME = 'WinAppDriver.exe';
// const UNINSTALL_REG_ROOT = 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
// const NAME_ENTRY_VALUE = 'Windows Application Driver';
// const NAME_ENTRY_KEY = 'DisplayName';

function generateWadDownloadLink () {
  const wadArch = ARCH_MAPPING[process.arch];
  if (!wadArch) {
    throw new Error(`System architecture '${process.arch}' is not supported by Windows Application Driver. ` +
      `The only supported architectures are: ${_.keys(ARCH_MAPPING)}`);
  }
  return `https://github.com/Microsoft/WinAppDriver` +
    `/releases/download/v${WAD_VER}/WindowsApplicationDriver-${WAD_VER}-win-${wadArch}.exe`;
}

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
  const downloadLink = generateWadDownloadLink();
  const installerPath = path.resolve(await tempDir.staticDir(), path.basename(downloadLink));
  log.info(`Downloading ${downloadLink} to '${installerPath}'`);
  await net.downloadFile(downloadLink, installerPath, {timeout: WAD_DOWNLOAD_TIMEOUT_MS});
  const downloadedMd5 = await fs.md5(installerPath);
  const expectedMd5 = WAD_DOWNLOAD_MD5[process.arch];
  if (downloadedMd5 !== expectedMd5) {
    await fs.rimraf(installerPath);
    throw new Error(`Checksum validation error: expected ${expectedMd5} but got ${downloadedMd5}`);
  }
  return installerPath;
}

async function installWAD (installerPath) {
  log.info(`Running installer`);
  await exec(installerPath, ['/install', '/quiet', '/norestart']);
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
    return await getWADExecutablePath();
  } catch (e) {
    if (!(e instanceof WADNotFoundError)) {
      throw e;
    }
    log.info(`WinAppDriver doesn't exist, setting up`);
  }

  if (!await isAdmin()) {
    throw new Error(`You are not running as an administrator so WinAppDriver cannot be installed for you; please reinstall as admin`);
  }

  const installerPath = await downloadWAD();
  try {
    await installWAD(installerPath);
  } finally {
    await fs.rimraf(installerPath);
  }
}

export {
  downloadWAD, setupWAD, installWAD,
  getWADExecutablePath, isAdmin,
};
export default setupWAD;
