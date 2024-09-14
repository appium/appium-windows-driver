import axios from 'axios';
import semver from 'semver';
import _ from 'lodash';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { log } from '../build/lib/logger.js';
import { shellExec, downloadToFile } from '../build/lib/utils.js';
import fs from 'node:fs/promises';

const OWNER = 'microsoft';
const REPO = 'winappdriver';
const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPO}`;
const DOWNLOAD_TIMEOUT_MS = 45 * 1000;
const STABLE_VERSION = 'stable';
const EXT_MSI = '.msi';

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
      return pageUrl.replace(/^<|>$/g, '');
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
      timeout: DOWNLOAD_TIMEOUT_MS
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
    if (!version || !downloadUrl || !_.endsWith(assetName, EXT_MSI)) {
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
  log.debug(`Retrieving releases from ${API_ROOT}`);
  const releases = await listReleases();
  if (!releases.length) {
    throw new Error(`Cannot retrieve any valid WinAppDriver releases from GitHub`);
  }
  log.debug(`Retrieved ${releases.length} GitHub releases`);
  const release = selectRelease(releases, version);
  const installerPath = path.join(
    tmpdir(),
    `wad_setup_${(Math.random() + 1).toString(36).substring(7)}${EXT_MSI}`
  );
  log.info(`Will download and install v${release.version} from ${release.downloadUrl}`);
  try {
    await downloadToFile(release.downloadUrl, installerPath);
    await shellExec(installerPath, ['/install', '/quiet', '/norestart']);
  } finally {
    try {
      await fs.unlink(installerPath);
    } catch (ign) {}
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
