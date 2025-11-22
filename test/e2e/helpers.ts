import type { remote } from 'webdriverio';

export const TEST_PORT = parseInt(process.env.APPIUM_TEST_SERVER_PORT || '4788', 10);
export const TEST_HOST = process.env.APPIUM_TEST_SERVER_HOST || '127.0.0.1';

/**
 * Build WebdriverIO options for testing
 * @param app - The app identifier
 * @returns WebdriverIO options object
 */
export function buildWdIoOptions(app: string): Parameters<typeof remote>[0] {
  return {
    hostname: TEST_HOST,
    port: TEST_PORT,
    connectionRetryCount: 0,
    capabilities: {
      platformName: 'Windows',
      'appium:automationName': 'windows',
      'appium:app': app,
    }
  };
}

