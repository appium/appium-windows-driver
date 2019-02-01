#!/usr/bin/env node
// transpile:main

import yargs from 'yargs';
import { asyncify } from 'asyncbox';
import { startServer } from './lib/server';
import * as driver from './lib/driver';
import * as caps from './lib/desired-caps';


const { WindowsDriver } = driver;
const { desiredCapConstraints: commonCapConstraints } = caps;

const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 4723;

async function main () {
  let port = yargs.argv.port || DEFAULT_PORT;
  let address = yargs.argv.address || DEFAULT_HOST;
  return await startServer(port, address);
}

if (require.main === module) {
  asyncify(main);
}

export { WindowsDriver, commonCapConstraints };

export default WindowsDriver;
