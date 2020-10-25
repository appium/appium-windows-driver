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

## Power Shell commands execution

Since version 1.15.0 of the driver there is a possibility to run custom Power Shell scripts
from your client code. This feature is potentially insecure and thus needs to be
explicitly enabled when executing the server by providing `power_shell` key to the list
of enabled insecure features. Refer https://github.com/appium/appium/blob/master/docs/en/writing-running-appium/security.md for more details.
It is possible to ether execute a single Power Shell command (use the `command` argument)
or a whole script (use the `script` argument) and get its
stdout in response. If the script execution returns non-zero exit code then an exception
is going to be thrown. The exception message will contain the actual stderr.
Here's an example code of how to control the Notepad process:

```java
// java
String psScript =
  "$sig = '[DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);'\n" +
  "Add-Type -MemberDefinition $sig -name NativeMethods -namespace Win32\n" +
  "Start-Process Notepad\n" +
  "$hwnd = @(Get-Process Notepad)[0].MainWindowHandle\n" +
  "[Win32.NativeMethods]::ShowWindowAsync($hwnd, 2)\n" +
  "[Win32.NativeMethods]::ShowWindowAsync($hwnd, 4)\n" +
  "Stop-Process -Name Notepad";
driver.executeScript("powerShell", ImmutableMap.of("script", psScript));
```

Another example, which demonstrates how to use the command output:

```python
# python
cmd = 'Get-Process outlook -ErrorAction SilentlyContinue'
proc_info = driver.execute_script('powerShell', {'command', cmd})
if proc_info:
  print('Outlook is running')
else:
  print('Outlook is not running')
```

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
