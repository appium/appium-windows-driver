export const desiredCapConstraints = {
  // https://github.com/microsoft/WinAppDriver/blob/master/Docs/AuthoringTestScripts.md#supported-capabilities
  platformName: {
    presence: true,
    isString: true,
    inclusionCaseInsensitive: ['Windows']
  },
  browserName: {
    isString: true
  },
  platformVersion: {
    isString: true
  },
  app: {
    isString: true
  },
  appArguments: {
    isString: true
  },
  appTopLevelWindow: {
    isString: true
  },
  appWorkingDir: {
    isString: true
  },
  createSessionTimeout: {
    isNumber: true
  },
  'ms:waitForAppLaunch': {
    isNumber: true // in seconds
  },
  'ms:forcequit': {
    isBoolean: true
  },
  'ms:experimental-webdriver': {
    isBoolean: true
  },
  systemPort: {
    isNumber: true
  },
  prerun: {
    isObject: true
  },
  postrun: {
    isObject: true
  },
  wadUrl: {
    isString: true
  },
} as const;

export default desiredCapConstraints;
