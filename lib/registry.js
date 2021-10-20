import _ from 'lodash';
import { exec } from 'teen_process';

const REG = 'reg.exe';
const ENTRY_PATTERN = /^\s+(\w+)\s+([A-Z_]+)\s*(.*)/;

function parseRegEntries (root, block) {
  return (_.isEmpty(block) || _.isEmpty(root))
    ? []
    : block.reduce((acc, line) => {
      const match = ENTRY_PATTERN.exec(line);
      if (match) {
        acc.push({root, key: match[1], type: match[2], value: match[3] || ''});
      }
      return acc;
    }, []);
}

function parseRegQueryOutput (output) {
  const result = [];
  let root;
  let regEntriesBlock = [];
  for (const line of output.split('\n').map(_.trimEnd)) {
    if (!line) {
      continue;
    }

    const curIndent = line.length - _.trimStart(line).length;
    if (curIndent === 0) {
      result.push(...parseRegEntries(root, regEntriesBlock));
      root = line;
      regEntriesBlock = [];
    } else {
      regEntriesBlock.push(line);
    }
  }
  result.push(...parseRegEntries(root, regEntriesBlock));
  return result;
}

/**
 * @typedef Object RegEntry
 * @property {string} root Full path to the registry branch, for example
 * HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\DirectDrawEx
 * @property {string} key The registry key name
 * @property {string} type One of possible registry value types, for example
 * REG_DWORD or REG_SZ
 * @property {string} value The actual value. Could be empty
 */

/**
 * Lists registry tree (e.g. recursively) under the given root node.
 * The lookup is done under the same registry branch that the current process
 * system architecture.
 *
 * @param {string} root The registry key name, which consists of two parts:
 * - The root key: HKLM | HKCU | HKCR | HKU | HKCC
 * - The subkey under the selected root key, for example \Software\Microsoft
 * @returns {RegEntry[]} List of matched RegEntry instances or an empty list
 * if either no entries were found under the given root or the root does not exist.
 */
async function queryRegistry (root) {
  let stdout;
  try {
    ({stdout} = await exec(REG, ['query', root, '/s']));
  } catch (e) {
    return [];
  }
  return parseRegQueryOutput(stdout);
}

export { queryRegistry, parseRegQueryOutput };