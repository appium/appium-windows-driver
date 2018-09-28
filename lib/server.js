import log from './logger';
import { server as baseServer, routeConfiguringFunction } from 'appium-base-driver';
import { WindowsDriver } from './driver';

async function startServer (port, address) {
  let driver = new WindowsDriver({port, address});
  let router = routeConfiguringFunction(driver);
  let server = await baseServer(router, port, address);
  log.info(`WindowsDriver server listening on http://${address}:${port}`);
  return server;
}

export { startServer };
