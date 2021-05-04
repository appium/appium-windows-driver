#!/usr/bin/env node
// transpile:main

import { asyncify } from 'asyncbox';
import { startServer } from './lib/server';
import * as driver from './lib/driver';
import * as caps from './lib/desired-caps';


const { WindowsDriver } = driver;
const { desiredCapConstraints: commonCapConstraints } = caps;

const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 4723;

async function main () {
  const getArgValue = (argName) => {
    const argIndex = process.argv.indexOf(argName);
    return argIndex > 0 ? process.argv[argIndex + 1] : null;
  };
  const port = parseInt(getArgValue('--port'), 10) || DEFAULT_PORT;
  const address = getArgValue('--address') || DEFAULT_HOST;
  return await startServer(port, address);
}

if (require.main === module) {
  asyncify(main);
}

export { WindowsDriver, commonCapConstraints };

export default WindowsDriver;
