import _ from 'lodash';
import path from 'path';
import { errors } from 'appium/driver';
import { fs, mkdirp, util, zip } from 'appium/support';
import { MODIFY_FS_FEATURE } from '../constants';

// List of env variables, that can be expanded in path
const KNOWN_ENV_VARS = [
  'APPDATA', 'LOCALAPPDATA',
  'PROGRAMFILES', 'PROGRAMFILES(X86)',
  'PROGRAMDATA', 'ALLUSERSPROFILE',
  'TEMP', 'TMP',
  'HOMEPATH', 'USERPROFILE', 'PUBLIC'
];

/**
 *
 * @this {WindowsDriver}
 * @param {string} remotePath
 * @param {string} base64Data
 * @returns {Promise<void>}
 */
export async function pushFile (remotePath, base64Data) {
  this.assertFeatureEnabled(MODIFY_FS_FEATURE);
  if (remotePath.endsWith(path.sep)) {
    throw new errors.InvalidArgumentError(
      'It is expected that remote path points to a file rather than a folder. ' +
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
}

/**
 *
 * @this {WindowsDriver}
 * @param {string} remotePath
 * @returns {Promise<string>}
 */
export async function pullFile (remotePath) {
  const fullPath = resolveToAbsolutePath(remotePath);
  await checkFileExists(fullPath);
  return (await util.toInMemoryBase64(fullPath)).toString();
}

/**
 *
 * @this {WindowsDriver}
 * @param {string} remotePath
 * @returns {Promise<string>}
 */
export async function pullFolder (remotePath) {
  const fullPath = resolveToAbsolutePath(remotePath);
  await checkFolderExists(fullPath);
  return (await zip.toInMemoryZip(fullPath, {
    encodeToBase64: true,
  })).toString();
}

/**
 * Remove the file from the file system
 *
 * @this {WindowsDriver}
 * @param {string} remotePath - The path to a file.
 * The path may contain environment variables that could be expanded on the server side.
 * Due to security reasons only variables listed below would be expanded: `APPDATA`,
 * `LOCALAPPDATA`, `PROGRAMFILES`, `PROGRAMFILES(X86)`, `PROGRAMDATA`, `ALLUSERSPROFILE`,
 * `TEMP`, `TMP`, `HOMEPATH`, `USERPROFILE`, `PUBLIC`.
 * @throws {InvalidArgumentError} If the file to be deleted does not exist or
 * remote path is not an absolute path.
 */
export async function windowsDeleteFile (remotePath) {
  this.assertFeatureEnabled(MODIFY_FS_FEATURE);
  const fullPath = resolveToAbsolutePath(remotePath);
  await checkFileExists(fullPath);
  await fs.unlink(fullPath);
}

/**
 * Remove the folder from the file system
 *
 * @this {WindowsDriver}
 * @param {string} remotePath - The path to a folder.
 * The path may contain environment variables that could be expanded on the server side.
 * Due to security reasons only variables listed below would be expanded: `APPDATA`,
 * `LOCALAPPDATA`, `PROGRAMFILES`, `PROGRAMFILES(X86)`, `PROGRAMDATA`, `ALLUSERSPROFILE`,
 * `TEMP`, `TMP`, `HOMEPATH`, `USERPROFILE`, `PUBLIC`.
 * @throws {InvalidArgumentError} If the folder to be deleted does not exist or
 * remote path is not an absolute path.
 */
export async function windowsDeleteFolder (remotePath) {
  this.assertFeatureEnabled(MODIFY_FS_FEATURE);
  const fullPath = resolveToAbsolutePath(remotePath);
  await checkFolderExists(fullPath);
  await fs.rimraf(fullPath);
}

/**
 *
 * @param {string} remotePath
 * @returns {string}
 */
function resolveToAbsolutePath (remotePath) {
  const resolvedPath = remotePath.replace(
    /%([^%]+)%/g,
    (_, key) => KNOWN_ENV_VARS.includes(key.toUpperCase())
      ? /** @type {string} */ (process.env[key.toUpperCase()])
      : `%${key}%`
  );

  if (!path.isAbsolute(resolvedPath)) {
    throw new errors.InvalidArgumentError('It is expected that remote path is absolute. ' +
      `'${resolvedPath}' is given instead`);
  }
  return resolvedPath;
}

/**
 *
 * @param {string} remotePath
 * @returns {Promise<void>}
 */
async function checkFileExists (remotePath) {
  if (!await fs.exists(remotePath)) {
    throw new errors.InvalidArgumentError(`The remote file '${remotePath}' does not exist.`);
  }
  const stat = await fs.stat(remotePath);
  if (!stat.isFile()) {
    throw new errors.InvalidArgumentError(
      'It is expected that remote path points to a file rather than a folder. ' +
      `'${remotePath}' is given instead`);
  }
}

/**
 *
 * @param {string} remotePath
 * @returns {Promise<void>}
 */
async function checkFolderExists (remotePath) {
  if (!await fs.exists(remotePath)) {
    throw new errors.InvalidArgumentError(`The remote folder '${remotePath}' does not exist.`);
  }
  const stat = await fs.stat(remotePath);
  if (!stat.isDirectory()) {
    throw new errors.InvalidArgumentError(
      'It is expected that remote path points to a folder rather than a file. ' +
      `'${remotePath}' is given instead`);
  }
}

/**
 * @typedef {import('../driver').WindowsDriver} WindowsDriver
 */