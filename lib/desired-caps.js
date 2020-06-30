const desiredCapConstraints = {
  // https://github.com/microsoft/WinAppDriver/blob/master/Docs/AuthoringTestScripts.md#supported-capabilities
  platformName: {
    presence: true,
    isString: true,
    inclusionCaseInsensitive: ['Windows']
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
    isNumber: true
  },
  address: {
    isString: true
  },
  port: {
    isNumber: true
  }
};

export { desiredCapConstraints };
export default desiredCapConstraints;
