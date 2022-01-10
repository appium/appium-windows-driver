import _ from 'lodash';
import { system, fs, util, net, tempDir } from 'appium-support';
import path from 'path';
import { exec } from 'teen_process';
import log from './logger';
import ES6Error from 'es6-error';
import { queryRegistry } from './registry';

// https://github.com/microsoft/WinAppDriver/releases
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
const UNINSTALL_REG_ROOT = 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
const REG_ENTRY_VALUE = 'Windows Application Driver';
const REG_ENTRY_KEY = 'DisplayName';
const REG_ENTRY_TYPE = 'REG_SZ';
const INST_LOCATION_SCRIPT_BY_GUID = (guid) => `
Set installer = CreateObject("WindowsInstaller.Installer")
Set session = installer.OpenProduct("${guid}")
session.DoAction("CostInitialize")
session.DoAction("CostFinalize")
WScript.Echo session.Property("INSTALLFOLDER")
`.replace(/\n/g, '\r\n');


function generateWadDownloadLink () {
  const wadArch = ARCH_MAPPING[process.arch];
  if (!wadArch) {
    throw new Error(`System architecture '${process.arch}' is not supported by Windows Application Driver. ` +
      `The only supported architectures are: ${_.keys(ARCH_MAPPING)}`);
  }
  return `https://github.com/Microsoft/WinAppDriver` +
    `/releases/download/v${WAD_VER}/WindowsApplicationDriver-${WAD_VER}-win-${wadArch}.exe`;
}

async function fetchMsiInstallLocation (installerGuid) {
  const tmpRoot = await tempDir.openDir();
  const scriptPath = path.join(tmpRoot, 'get_wad_inst_location.vbs');
  try {
    await fs.writeFile(scriptPath, INST_LOCATION_SCRIPT_BY_GUID(installerGuid), 'latin1');
    const {stdout} = await exec('cscript.exe', ['/Nologo', scriptPath]);
    return _.trim(stdout);
  } finally {
    await fs.rimraf(tmpRoot);
  }
}

class WADNotFoundError extends ES6Error {}

const getWADExecutablePath = _.memoize(async function getWADInstallPath () {
  const wadPath = process.env.APPIUM_WAD_PATH;
  if (await fs.exists(wadPath)) {
    log.debug(`Loaded WinAppDriver path from the APPIUM_WAD_PATH environment variable: ${wadPath}`);
    return wadPath;
  }

  // TODO: WAD installer should write the full path to it into the system registry
  const pathCandidates = POSSIBLE_WAD_INSTALL_ROOTS
    // remove unset env variables
    .filter(Boolean)
    // construct full path
    .map((root) => path.resolve(root, REG_ENTRY_VALUE, WAD_EXE_NAME));
  for (const result of pathCandidates) {
    if (await fs.exists(result)) {
      return result;
    }
  }
  log.debug('Did not detect WAD executable at any of the default install locations');
  log.debug('Checking the system registry for the corresponding MSI entry');
  try {
    const uninstallEntries = await queryRegistry(UNINSTALL_REG_ROOT);
    const wadEntry = uninstallEntries.find(({key, type, value}) =>
      key === REG_ENTRY_KEY && value === REG_ENTRY_VALUE && type === REG_ENTRY_TYPE
    );
    if (wadEntry) {
      log.debug(`Found MSI entry: ${JSON.stringify(wadEntry)}`);
      const installerGuid = _.last(wadEntry.root.split('\\'));
      // WAD MSI installer leaves InstallLocation registry value empty,
      // so we need to be hacky here
      const result = path.join(await fetchMsiInstallLocation(installerGuid), WAD_EXE_NAME);
      log.debug(`Checking if WAD exists at '${result}'`);
      if (await fs.exists(result)) {
        return result;
      }
      log.debug(result);
    } else {
      log.debug('No WAD MSI entries have been found');
    }
  } catch (e) {
    if (e.stderr) {
      log.debug(e.stderr);
    }
    log.debug(e.stack);
  }
  throw new WADNotFoundError(`${WAD_EXE_NAME} has not been found in any of these ` +
    `locations: ${pathCandidates}. Is it installed?`);
});

async function downloadWAD () {
  const downloadLink = generateWadDownloadLink();
  const installerPath = path.resolve(await tempDir.staticDir(),
    `wad_installer_${WAD_VER}_${util.uuidV4()}.exe`);
  log.info(`Downloading ${downloadLink} to '${installerPath}'`);
  await net.downloadFile(downloadLink, installerPath, {timeout: WAD_DOWNLOAD_TIMEOUT_MS});
  const downloadedMd5 = await fs.md5(installerPath);
  const expectedMd5 = WAD_DOWNLOAD_MD5[process.arch];
  if (downloadedMd5 !== expectedMd5) {
    await fs.rimraf(installerPath);
    throw new Error(
      `Installer executable checksum validation error: expected ${expectedMd5} but got ${downloadedMd5}`
    );
  }
  return installerPath;
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
  log.info('Running installer');
  try {
    await exec(installerPath, ['/install', '/quiet', '/norestart']);
  } finally {
    await fs.rimraf(installerPath);
  }
}

export { downloadWAD, setupWAD, getWADExecutablePath, isAdmin };
export default setupWAD;
