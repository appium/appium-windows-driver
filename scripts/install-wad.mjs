import axios from 'axios';
import semver from 'semver';
import _ from 'lodash';
import { logger, net, tempDir, fs, util } from '@appium/support';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import B from 'bluebird';

const log = logger.getLogger('WAD Installer');
const OWNER = 'microsoft';
const REPO = 'winappdriver';
const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPO}`;
const timeoutMs = 15 * 1000;
const ASSET_NAME = 'WindowsApplicationDriver.msi';
const STABLE_VERSION = 'stable';
const execAsync = promisify(exec);

/**
 * This API triggers UAC when necessary
 * unlike the 'spawn' call used by teen_process's exec.
 * See https://github.com/nodejs/node-v0.x-archive/issues/6797
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {import('node:child_process').ExecOptions & {timeoutMs?: number}} opts
 * @returns {Promise<{stdout: string; stderr: string;}>}
 * @throws {import('node:child_process').ExecException}
 */
async function shellExec(cmd, args = [], opts = {}) {
  const {
    timeoutMs = 60 * 1000 * 5
  } = opts;
  const fullCmd = util.quote([cmd, ...args]);
  return await B.resolve(execAsync(fullCmd, opts))
    .timeout(timeoutMs, `The command '${fullCmd}' timed out after ${timeoutMs}ms`);
}

/**
 *
 * @param {import('axios').AxiosResponseHeaders} headers
 * @returns {string|null}
 */
function parseNextPageUrl(headers) {
  if (!headers.link) {
    return null;
  }

  for (const part of headers.link.split(';')) {
    const [rel, pageUrl] = part.split(',').map(_.trim);
    if (rel === 'rel="next"' && pageUrl) {
      return pageUrl.replace(/^<|>$/, '');
    }
  }
  return null;
}

/**
 * https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28#list-releases
 *
 * @returns {Promise<ReleaseInfo[]}
 */
async function listReleases() {
  /** @type {Record<string, any>[]} */
  const allReleases = [];
  let currentUrl = `${API_ROOT}/releases`;
  do {
    const {data, headers} = await axios.get(currentUrl, {
      timeout: timeoutMs
    });
    allReleases.push(...data);
    currentUrl = parseNextPageUrl(headers);
  } while (currentUrl);
  /** @type {ReleaseInfo[]} */
  const result = [];
  for (const releaseInfo of allReleases) {
    const isDraft = !!releaseInfo.draft;
    const isPrerelease = !!releaseInfo.prerelease;
    const version = semver.coerce(releaseInfo.tag_name?.replace(/^v/, ''));
    const downloadUrl = releaseInfo.assets?.[0]?.browser_download_url;
    const assetName = releaseInfo.assets?.[0]?.name;
    if (!version || !downloadUrl || !_.endsWith(assetName, '.msi')) {
      continue;
    }
    result.push({
      version,
      isDraft,
      isPrerelease,
      downloadUrl,
    });
  }
  return result;
}

/**
 * @param {ReleaseInfo[]} releases
 * @param {string} version
 * @returns {ReleaseInfo}
 */
function selectRelease(releases, version) {
  if (version === STABLE_VERSION) {
    const stableReleasesAsc = releases
      .filter(({isDraft, isPrerelease}) => !isDraft && !isPrerelease)
      .toSorted((a, b) => a.version.compare(b.version));
    const dstRelease = _.last(stableReleasesAsc);
    if (!dstRelease) {
      throw new Error(`Cannot find any stable WinAppDriver release: ${JSON.stringify(releases)}`);
    }
    return dstRelease;
  }
  const coercedVersion = semver.coerce(version);
  if (!coercedVersion) {
    throw new Error(`The provided version string '${version}' cannot be coerced to a valid SemVer representation`);
  }
  const dstRelease = releases.find((r) => r.version.compare(coercedVersion) === 0);
  if (!dstRelease) {
    throw new Error(
      `The provided version string '${version}' cannot be matched to any available WinAppDriver releases: ` +
      JSON.stringify(releases)
    );
  }
  return dstRelease;
}

/**
 *
 * @param {string} version
 * @returns {Promise<void>}
 */
async function installWad(version) {
  log.debug(`Retrieving WinAppDriver releases from ${API_ROOT}`);
  const releases = await listReleases();
  if (!releases.length) {
    throw new Error(`Cannot retrieve any valid WinAppDriver releases from GitHub`);
  }
  log.debug(`Retrieved ${util.pluralize('WinAppDriver GitHub release', releases.length, true)}`);
  const release = selectRelease(releases, version);
  log.info(`Will download and install WinAppDriver (${JSON.stringify(release)})`);
  const tmpRoot = await tempDir.openDir();
  const installerPath = path.join(tmpRoot, ASSET_NAME);
  try {
    await net.downloadFile(release.downloadUrl, installerPath);
    await shellExec(installerPath, ['/install', '/quiet', '/norestart']);
  } finally {
    await fs.rimraf(tmpRoot);
  }
}

(async () => await installWad(process.argv[2] ?? STABLE_VERSION))();

/**
 * @typedef {Object} ReleaseInfo
 * @property {import('semver').SemVer} version
 * @property {boolean} isDraft
 * @property {boolean} isPrerelease
 * @property {string} downloadUrl
 */
