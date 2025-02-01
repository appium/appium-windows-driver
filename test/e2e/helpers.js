export const TEST_PORT = parseInt(process.env.APPIUM_TEST_SERVER_PORT || 4788, 10);
export const TEST_HOST = process.env.APPIUM_TEST_SERVER_HOST || '127.0.0.1';


/**
 *
 * @param {string} app
 * @returns {Record<string, any>}
 */
export function buildWdIoOptions(app) {
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
