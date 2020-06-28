const desiredCapConstraints = {
  platformName: {
    presence: true,
    isString: true,
    inclusionCaseInsensitive: ['Windows']
  },
  app: {
    isString: true
  },
  createSessionTimeout: {
    isNumber: true
  },
  appName: {
    isString: true
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
