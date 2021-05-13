import _ from 'lodash';
import log from '../logger';
import path from 'path';
import { errors } from 'appium-base-driver';
import { fs, mkdirp, util, zip } from 'appium-support';
import { DELETE_FILES_FEATURE } from '../constants';

// List of env variables, that can be expanded in path
const KNOWN_ENV_VARS = [
  'APPDATA', 'LOCALAPPDATA',
  'PROGRAMFILES', 'PROGRAMFILES(X86)',
  'PROGRAMDATA', 'ALLUSERSPROFILE',
  'TEMP', 'TMP',
  'HOMEPATH', 'USERPROFILE', 'PUBLIC'
];
const commands = {};

commands.pushFile = async function pushFile (remotePath, base64Data) {
  if (remotePath.endsWith(path.sep)) {
    throw new errors.InvalidArgumentError(
      'It is expected that remote path points to a file and not to a folder. ' +
      `'${remotePath}' is given instead`);
  }

  if (_.isArray(base64Data)) {
    // some clients (ahem) java, send a byte array encoding utf8 characters
    // instead of a string, which would be infinitely better!
    base64Data = Buffer.from(base64Data).toString('utf8');
  }

  const fullPath = resolveToAbsolutePath(remotePath);
  await mkdirp(path.dirname(fullPath));
  const content = Buffer.from(base64Data, 'base64');
  await fs.writeFile(fullPath, content);
};

commands.pullFile = async function pullFile (remotePath) {
  const fullPath = resolveToAbsolutePath(remotePath);
  await checkFileExists(fullPath);
  return (await util.toInMemoryBase64(fullPath)).toString();
};

commands.pullFolder = async function pullFolder (remotePath) {
  const fullPath = resolveToAbsolutePath(remotePath);
  await checkFolderExists(fullPath);
  return (await zip.toInMemoryZip(fullPath, {
    encodeToBase64: true,
  })).toString();
};

/**
 * @typedef {Object} DeleteFileOptions
 * @property {string} remotePath - The path to a file
 */

/**
 * Remove the file from the file system
 *
 * @param {DeleteFileOptions} opts
 */
commands.windowsDeleteFile = async function windowsDeleteFile (opts = {}) {
  this.ensureFeatureEnabled(DELETE_FILES_FEATURE);
  const { remotePath } = opts;
  const fullPath = resolveToAbsolutePath(remotePath);
  await checkFileExists(fullPath);
  await fs.unlink(fullPath);
};

/**
 * @typedef {Object} DeleteFolderOptions
 * @property {string} remotePath - The path to a folder
 */

/**
 * Remove the folder from the file system
 *
 * @param {DeleteFolderOptions} opts
 */
commands.windowsDeleteFolder = async function windowsDeleteFolder (opts = {}) {
  this.ensureFeatureEnabled(DELETE_FILES_FEATURE);
  const { remotePath } = opts;
  const fullPath = resolveToAbsolutePath(remotePath);
  await checkFolderExists(fullPath);
  await fs.rimraf(fullPath);
};

function resolveToAbsolutePath (remotePath) {
  const resolvedPath = remotePath.replace(/%([^%]+)%/g,
    (_, key) => KNOWN_ENV_VARS.includes(key.toUpperCase())
      ? process.env[key.toUpperCase()]
      : `%${key}%`);

  log.debug(`Resolved path '${resolvedPath}'.`);
  if (!path.isAbsolute(resolvedPath)) {
    throw new errors.InvalidArgumentError('It is expected that remote path is absolute. ' +
      `'${resolvedPath}' is given instead`);
  }
  return resolvedPath;
}

async function checkFileExists (remotePath) {
  if (!await fs.exists(remotePath)) {
    throw new errors.InvalidArgumentError(`Remote file '${remotePath}' not exists.`);
  }
  const stat = await fs.stat(remotePath);
  if (!stat.isFile()) {
    throw new errors.InvalidArgumentError(
      'It is expected that remote path points to a file not a folder. ' +
      `'${remotePath}' is given instead`);
  }
}

async function checkFolderExists (remotePath) {
  if (!await fs.exists(remotePath)) {
    throw new errors.InvalidArgumentError(`Remote folder '${remotePath}' not exists.`);
  }
  const stat = await fs.stat(remotePath);
  if (!stat.isDirectory()) {
    throw new errors.InvalidArgumentError(
      'It is expected that remote path points to a folder not a file. ' +
      `'${remotePath}' is given instead`);
  }
}

export { commands };
export default commands;
