import axios from 'axios';
import * as semver from 'semver';
import _ from 'lodash';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { log } from '../build/lib/logger.js';
import { shellExec, downloadToFile } from '../build/lib/utils.js';
import fs from 'node:fs/promises';

const OWNER = 'microsoft';
const REPO = 'winappdriver';
const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPO}`;
const API_TIMEOUT_MS = 45 * 1000;
const STABLE_VERSION = 'stable';
const EXT_MSI = '.msi';
const EXT_EXE = '.exe';
const ARCH_MAPPING = Object.freeze({
  ia32: 'x86',
  x64: 'x64',
  arm64: 'arm64',
});

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
      timeout: API_TIMEOUT_MS
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
    if (!version) {
      continue;
    }
    /** @type {ReleaseAsset[]} */
    const releaseAssets = [];
    for (const asset of (releaseInfo.assets ?? [])) {
      const assetName = asset?.name;
      const downloadUrl = asset?.browser_download_url;
      if (!(_.endsWith(assetName, EXT_MSI) || _.endsWith(assetName, EXT_EXE)) || !downloadUrl) {
        continue;
      }
      releaseAssets.push({
        name: assetName,
        url: downloadUrl,
      });
    }
    result.push({
      version,
      isDraft,
      isPrerelease,
      assets: releaseAssets,
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
 * @param {ReleaseInfo} release
 * @returns {ReleaseAsset}
 */
function selectAsset(release) {
  if (_.isEmpty(release.assets)) {
    throw new Error(`WinAppDriver v${release.version} does not contain any matching releases`);
  }
  if (release.assets.length === 1) {
    return release.assets[0];
  }
  // Since v 1.2.99 installers for multiple OS architectures are provided
  for (const asset of release.assets) {
    if (_.includes(asset.name, `win-${ARCH_MAPPING[process.arch]}.`)) {
      return asset;
    }
  }
  throw new Error(
    `WinAppDriver v${release.version} does not contain any release matching the ` +
    `current OS architecture ${process.arch}. Available packages: ${release.assets.map(({name}) => name)}`
  );
}

/**
 *
 * @param {string} version
 * @returns {Promise<void>}
 */
async function installWad(version) {
  if (process.platform !== 'win32') {
    throw new Error('WinAppDriver is only supported on Windows');
  }
  log.debug(`Retrieving releases from ${API_ROOT}`);
  const releases = await listReleases();
  if (!releases.length) {
    throw new Error(`Cannot retrieve any valid WinAppDriver releases from GitHub`);
  }
  log.debug(`Retrieved ${releases.length} GitHub releases`);
  const release = selectRelease(releases, version);
  const asset = selectAsset(release);
  const parsedName = path.parse(asset.name);
  const installerPath = path.join(
    tmpdir(),
    `${parsedName.name}_${(Math.random() + 1).toString(36).substring(7)}${parsedName.ext}`
  );
  log.info(`Will download and install v${release.version} from ${asset.url}`);
  try {
    await downloadToFile(asset.url, installerPath);
    if (_.toLower(parsedName.ext) === EXT_MSI) {
      await shellExec('msiexec.exe', ['/i', installerPath, '/quiet', '/norestart']);
    } else if (_.toLower(parsedName.ext) === EXT_EXE) {
      await shellExec(installerPath, ['/install', '/quiet', '/norestart']);
    } else {
      throw new Error(`Unsupported WAD installer: ${asset.name}`);
    }
  } finally {
    try {
      await fs.unlink(installerPath);
    } catch {}
  }
}

(async () => await installWad(process.argv[2] ?? STABLE_VERSION))();

/**
 * @typedef {Object} ReleaseAsset
 * @property {string} name
 * @property {string} url
 */

/**
 * @typedef {Object} ReleaseInfo
 * @property {import('semver').SemVer} version
 * @property {boolean} isDraft
 * @property {boolean} isPrerelease
 * @property {ReleaseAsset[]} assets
 */
