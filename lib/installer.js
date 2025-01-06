import _ from 'lodash';
import { fs, tempDir } from 'appium/support';
import path from 'path';
import { exec } from 'teen_process';
import { log } from './logger';
import { queryRegistry } from './registry';
import { shellExec } from './utils';

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

async function fetchMsiInstallLocation (installerGuid) {
  const tmpRoot = await tempDir.openDir();
  const scriptPath = path.join(tmpRoot, 'get_wad_inst_location.vbs');
  try {
    await fs.writeFile(scriptPath, INST_LOCATION_SCRIPT_BY_GUID(installerGuid), 'latin1');
    const {stdout} = await shellExec('cscript.exe', ['/Nologo', scriptPath]);
    return _.trim(stdout);
  } finally {
    await fs.rimraf(tmpRoot);
  }
}

class WADNotFoundError extends Error {}

export const getWADExecutablePath = _.memoize(async function getWADInstallPath () {
  const wadPath = process.env.APPIUM_WAD_PATH ?? '';
  if (await fs.exists(wadPath)) {
    log.debug(`Loaded WinAppDriver path from the APPIUM_WAD_PATH environment variable: ${wadPath}`);
    return wadPath;
  }

  // TODO: WAD installer should write the full path to it into the system registry
  const pathCandidates = POSSIBLE_WAD_INSTALL_ROOTS
    // remove unset env variables
    .filter(Boolean)
    // construct full path
    // @ts-ignore The above filter does the job
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
    `locations: ${pathCandidates}. Use the following driver script to install it: ` +
    `'appium driver run windows install-wad <optional_wad_version>'. ` +
    `Check https://github.com/microsoft/WinAppDriver/releases to list ` +
    `available server versions or drop the '<optional_wad_version>' argument to ` +
    `install the latest stable one.`
  );
});

export async function isAdmin () {
  try {
    await exec('fsutil.exe', ['dirty', 'query', process.env.SystemDrive || 'C:']);
    return true;
  } catch {
    return false;
  }
};
