/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require('fs');
const path = require('path');
const {logger} = require('appium/support');

const log = logger.getLogger('WADInstaller');

async function installWadServer () {
  if (process.platform !== 'win32') {
    log.info('Not installing WinAppDriver since did not detect a Windows system');
    process.exit(0);
  }

  const installScript = path.resolve(__dirname, 'build', 'lib', 'installer.js');
  try {
    await fs.promises.access(installScript, fs.constants.R_OK);
  } catch (ign) {
    log.warn(`Unable to import the install script at '${installScript}'. ` +
      `Consider installing WinAppDriver server manually.`);
    return;
  }
  const { setupWAD } = require(installScript);
  try {
    await setupWAD();
  } catch (err) {
    log.error(`WinAppDriver server was not installed, consider installing it manually. `
      + `Original error: ${err.message}`);
  }
}

(async () => await installWadServer())();
