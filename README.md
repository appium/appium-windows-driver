Appium Windows Driver
===================

Appium Windows Driver is a test automation tool for Windows devices. Appium Windows Driver automates UWP apps on Windows 10.  In the future it will automate other kinds of native, hybrid and mobile web apps on Windows 10 and Windows 10 mobile simulators and real devices. Appium Windows Driver is part of the [Appium](https://github.com/appium/appium) mobile test automation tool.


## Installation
```
npm install appium-windows-driver
```

## Usage
Import Windows Driver, set [desired capabilities](http://appium.io/slate/en/1.5/?javascript#appium-server-capabilities) and create a session:

```
import { WindowsDriver } from `appium-windows-driver`

let defaultCaps = {
  app: 'your.app.id',
  platformName: 'Windows'
};

let driver = new WindowsDriver();
await driver.createSession(defaultCaps);
```

## WindowsDriver-specific capabilities

|Capability|Description|Values|
|----------|-----------|------|
|`createSessionTimeout`|Timeout in milliseconds used to retry `WinAppDriver` session startup. This capability could be used as a workaround for the long startup times of UWP applications (aka `Failed to locate opened application window with appId: TestCompany.my_app4!App, and processId: 8480`). Default value `20000`|e.g., `15000`|


## Watch code for changes, re-transpile and run unit tests:

```
gulp
```

## Test


You can run unit and e2e tests:


```
// unit tests:
gulp once

// e2e tests
gulp e2e-test
```
