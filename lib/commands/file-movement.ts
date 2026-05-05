import path from 'node:path';
import {errors} from 'appium/driver';
import {fs, util, zip} from 'appium/support';
import {MODIFY_FS_FEATURE} from '../constants';
import type {WindowsDriver} from '../driver';

// List of env variables, that can be expanded in path
const KNOWN_ENV_VARS = [
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMDATA',
  'ALLUSERSPROFILE',
  'TEMP',
  'TMP',
  'HOMEPATH',
  'USERPROFILE',
  'PUBLIC',
];

/** Writes a base64 file to an absolute path on the Windows host. */
export async function pushFile(
  this: WindowsDriver,
  remotePath: string,
  base64Data: string | readonly number[],
): Promise<void> {
  this.assertFeatureEnabled(MODIFY_FS_FEATURE);
  if (remotePath.endsWith(path.sep)) {
    throw new errors.InvalidArgumentError(
      'It is expected that remote path points to a file rather than a folder. ' +
        `'${remotePath}' is given instead`,
    );
  }

  let encoded: string;
  if (typeof base64Data === 'string') {
    encoded = base64Data;
  } else {
    // some clients (ahem) java, send a byte array encoding utf8 characters
    // instead of a string, which would be infinitely better!
    encoded = Buffer.from([...base64Data]).toString('utf8');
  }

  const fullPath = resolveToAbsolutePath(remotePath);
  await fs.mkdirp(path.dirname(fullPath));
  const content = Buffer.from(encoded, 'base64');
  await fs.writeFile(fullPath, content);
}

/** Reads a remote file and returns its contents as base64. */
export async function pullFile(this: WindowsDriver, remotePath: string): Promise<string> {
  const fullPath = resolveToAbsolutePath(remotePath);
  await checkFileExists(fullPath);
  return (await util.toInMemoryBase64(fullPath)).toString();
}

/** Zips a remote folder and returns the archive as base64. */
export async function pullFolder(this: WindowsDriver, remotePath: string): Promise<string> {
  const fullPath = resolveToAbsolutePath(remotePath);
  await checkFolderExists(fullPath);
  return (
    await zip.toInMemoryZip(fullPath, {
      encodeToBase64: true,
    })
  ).toString();
}

/**
 * Remove a file from the file system.
 *
 * The path may contain environment variables that could be expanded on the server side.
 * Due to security reasons only variables listed below would be expanded: `APPDATA`,
 * `LOCALAPPDATA`, `PROGRAMFILES`, `PROGRAMFILES(X86)`, `PROGRAMDATA`, `ALLUSERSPROFILE`,
 * `TEMP`, `TMP`, `HOMEPATH`, `USERPROFILE`, `PUBLIC`.
 */
export async function windowsDeleteFile(this: WindowsDriver, remotePath: string): Promise<void> {
  this.assertFeatureEnabled(MODIFY_FS_FEATURE);
  const fullPath = resolveToAbsolutePath(remotePath);
  await checkFileExists(fullPath);
  await fs.unlink(fullPath);
}

/**
 * Remove a folder from the file system.
 *
 * The path may contain environment variables that could be expanded on the server side.
 * Due to security reasons only variables listed below would be expanded: `APPDATA`,
 * `LOCALAPPDATA`, `PROGRAMFILES`, `PROGRAMFILES(X86)`, `PROGRAMDATA`, `ALLUSERSPROFILE`,
 * `TEMP`, `TMP`, `HOMEPATH`, `USERPROFILE`, `PUBLIC`.
 */
export async function windowsDeleteFolder(this: WindowsDriver, remotePath: string): Promise<void> {
  this.assertFeatureEnabled(MODIFY_FS_FEATURE);
  const fullPath = resolveToAbsolutePath(remotePath);
  await checkFolderExists(fullPath);
  await fs.rimraf(fullPath);
}

function resolveToAbsolutePath(remotePath: string): string {
  const resolvedPath = remotePath.replace(/%([^%]+)%/g, (_, key: string) =>
    KNOWN_ENV_VARS.includes(key.toUpperCase())
      ? (process.env[key.toUpperCase()] as string)
      : `%${key}%`,
  );

  if (!path.isAbsolute(resolvedPath)) {
    throw new errors.InvalidArgumentError(
      'It is expected that remote path is absolute. ' + `'${resolvedPath}' is given instead`,
    );
  }
  return resolvedPath;
}

async function checkFileExists(remotePath: string): Promise<void> {
  if (!(await fs.exists(remotePath))) {
    throw new errors.InvalidArgumentError(`The remote file '${remotePath}' does not exist.`);
  }
  const stat = await fs.stat(remotePath);
  if (!stat.isFile()) {
    throw new errors.InvalidArgumentError(
      'It is expected that remote path points to a file rather than a folder. ' +
        `'${remotePath}' is given instead`,
    );
  }
}

async function checkFolderExists(remotePath: string): Promise<void> {
  if (!(await fs.exists(remotePath))) {
    throw new errors.InvalidArgumentError(`The remote folder '${remotePath}' does not exist.`);
  }
  const stat = await fs.stat(remotePath);
  if (!stat.isDirectory()) {
    throw new errors.InvalidArgumentError(
      'It is expected that remote path points to a folder rather than a file. ' +
        `'${remotePath}' is given instead`,
    );
  }
}
