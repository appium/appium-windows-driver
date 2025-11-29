import _ from 'lodash';
import { runElevated } from './utils';

const REG = 'reg.exe';
const ENTRY_PATTERN = /^\s+(\w+)\s+([A-Z_]+)\s*(.*)/;

/**
 * Parses the output of the reg query command into a list of RegEntry instances
 *
 * @param output - The output of the reg query command
 * @returns List of matched RegEntry instances
 */
export function parseRegQueryOutput(output: string): RegEntry[] {
  const result: RegEntry[] = [];
  let root: string | undefined;
  let regEntriesBlock: string[] = [];
  const lines = output.split('\n').map((l: string) => _.trimEnd(l));
  for (const line of lines) {
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
 * Lists registry tree (e.g. recursively) under the given root node.
 * The lookup is done under the same registry branch that the current process
 * system architecture.
 *
 * @param root - The registry key name, which consists of two parts:
 * - The root key: HKLM | HKCU | HKCR | HKU | HKCC
 * - The subkey under the selected root key, for example \Software\Microsoft
 * @returns List of matched RegEntry instances or an empty list
 * if either no entries were found under the given root or the root does not exist.
 */
export async function queryRegistry(root: string): Promise<RegEntry[]> {
  let stdout: string;
  try {
    ({stdout} = await runElevated(REG, ['query', root, '/s']));
  } catch {
    return [];
  }
  return parseRegQueryOutput(stdout);
}

function parseRegEntries(root: string | undefined, block: string[]): RegEntry[] {
  if (_.isEmpty(block) || !root || _.isEmpty(root)) {
    return [];
  }
  return block.reduce((acc: RegEntry[], line: string) => {
    const match = ENTRY_PATTERN.exec(line);
    if (match) {
      acc.push({root, key: match[1], type: match[2], value: match[3] || ''});
    }
    return acc;
  }, []);
}

export interface RegEntry {
  /** Full path to the registry branch, for example
   * HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\DirectDrawEx */
  root: string;
  /** The registry key name */
  key: string;
  /** One of possible registry value types, for example REG_DWORD or REG_SZ */
  type: string;
  /** The actual value. Could be empty */
  value: string;
}
