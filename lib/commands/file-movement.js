import _ from 'lodash';
import log from '../logger';
import path from 'path';
import { fs, mkdirp, util, zip } from 'appium-support';

const commands = {};

commands.pushFile = async function pushFile (remotePath, base64Data) {
  if (remotePath.endsWith('/')) {
    log.errorAndThrow(`It is expected that remote path points to a file and not to a folder. ` +
      `'${remotePath}' is given instead`);
  }

  if (_.isArray(base64Data)) {
    // some clients (ahem) java, send a byte array encoding utf8 characters
    // instead of a string, which would be infinitely better!
    base64Data = Buffer.from(base64Data).toString('utf8');
  }

  let fullPath = resolveToAbsolutePath(remotePath);
  await mkdirp(path.dirname(fullPath));
  let content = Buffer.from(base64Data, 'base64');
  await fs.writeFile(fullPath, content);
};

commands.pullFile = async function pullFile (remotePath) {
  if (remotePath.endsWith('/')) {
    log.errorAndThrow(`It is expected that remote path points to a file and not to a folder. ` +
      `'${remotePath}' is given instead`);
  }
  let fullPath = resolveToAbsolutePath(remotePath);
  return (await util.toInMemoryBase64(fullPath)).toString();
};

commands.pullFolder = async function pullFolder (remotePath) {
  let fullPath = resolveToAbsolutePath(remotePath);
  return (await zip.toInMemoryZip(fullPath, {
    encodeToBase64: true,
  })).toString();
};

commands.windowsDeleteFile = async function windowsDeleteFile (opts = {}) {
  const { remotePath } = opts;
  if (remotePath.endsWith('/')) {
    log.errorAndThrow(`It is expected that remote path points to a file and not to a folder. ` +
      `'${remotePath}' is given instead`);
  }
  let fullPath = resolveToAbsolutePath(remotePath);
  await fs.unlink(fullPath);
};

commands.windowsDeleteFolder = async function windowsDeleteFolder (opts = {}) {
  let { remotePath } = opts;
  let fullPath = resolveToAbsolutePath(remotePath);
  await fs.rimraf(fullPath);
};

function resolveToAbsolutePath (remotePath) {
  let resolvedPath = remotePath.replace(/%([^%]+)%/g, function (_, key) {
    return process.env[key];
  });
  log.debug(`Resolved path '${resolvedPath}'.`);
  if (!path.isAbsolute(resolvedPath)) {
    log.errorAndThrow(`It is expected that remote path is absolute. ` +
      `'${resolvedPath}' is given instead`);
  }
  return resolvedPath;
}

export { commands };
export default commands;