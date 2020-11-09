Appium Windows Driver
===================

Appium Windows Driver is a test automation tool for Windows devices. Appium Windows Driver automates UWP and classic apps on Windows 10. In the future it will automate other kinds of native, hybrid and mobile web apps on Windows 10 and Windows 10 mobile simulators and real devices.

The driver is maintained by Microsoft at https://github.com/microsoft/WinAppDriver. Check its [release notes](https://github.com/microsoft/WinAppDriver/releases) to get more details on the supported features and possible pitfalls.


## Usage

Beside of standard Appium requirements Appium Windows Driver adds the following prerequisites:

- Currently Appium Windows Driver only supports Windows 10 as the host.
- Appium process must be run under Administrator account
- [Developer mode](https://docs.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development) must be enabled
- Appium can download and install Appium Windows Driver package automatically, although, it could be out of date. In such case you could download and install the most recent version of Appium Windows Driver manually from the [GitHub releases](https://github.com/microsoft/WinAppDriver/releases) page.

Appium Windows Driver supports the following capabilities:

Capability Name | Description
--- | ---
platformName | Must be set to `windows` (case-insensitive).
automationName | Must be set to `windows` (case-insensitive).
app | The name of the UWP application to test or full path to a classic app, for example `Microsoft.WindowsCalculator_8wekyb3d8bbwe!App` or `C:\Windows\System32\notepad.exe`. Either this capability or `appTopLevelWindow` must be provided on session startup.
appArguments | Application arguments string, for example `/?`.
appTopLevelWindow | The hexadecimal handle of an existing application top level window to attach to, for example `0x12345` (should be of string type). Either this capability or `app` must be provided on session startup.
appWorkingDir | Full path to folder, which is going to be set as the working dir for the application under test. This is only applicable for classic apps.
createSessionTimeout | Timeout in milliseconds used to retry Appium Windows Driver session startup. This capability could be used as a workaround for the long startup times of UWP applications (aka `Failed to locate opened application window with appId: TestCompany.my_app4!App, and processId: 8480`). Default value is `20000`.
ms:waitForAppLaunch | Similar to `createSessionTimeout`, but in seconds and happens on the server side. Enables Appium Windows Driver to wait for a defined amount of time after an app launch is initiated prior to attaching to the application session. The limit for this is 50 seconds.
ms:experimental-webdriver | Enables experimental features and optimizations. See Appium Windows Driver release notes for more details on this capability. `false` by default
systemPort | The port number to execute Appium Windows Driver server listener on, for example `5556`. The port must not be occupied. The default starting port number for a new Appium Windows Driver session is `4724`. If this port is already busy then the next free port will be automatically selected.


## Example

```python
# Python3 + PyTest
import pytest

from appium import webdriver


def generate_caps():
    common_caps = {
        'platformName': 'Windows',
        # automationName capability presence is mandatory for Appium Windows Driver to be selected
        'automationName': 'Windows',
    }
    uwp_caps = {
        **common_caps,
        # https://www.securitylearningacademy.com/mod/book/view.php?id=13829&chapterid=678
        'app': 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
    }
    classic_caps = {
        **common_caps,
        'app': 'C:\\Windows\\System32\\notepad.exe',
        # Make sure arguments are quoted/escaped properly if necessary
        # https://ss64.com/nt/syntax-esc.html
        'appArguments': 'D:\\log.txt',
        'appWorkingDir': 'D:\\',
    }
    use_existing_app_caps: {
        **common_caps,
        # Active window handles could be retrieved from any compatible UI inspector app
        # Check https://docs.microsoft.com/en-us/windows/win32/winauto/inspect-objects
        # or https://accessibilityinsights.io/.
        # Also, it is possible to use the corresponding WinApi calls for this purpose,
        # for example https://stackoverflow.com/questions/44735798/pywin32-how-to-get-window-handle-from-process-handle-and-vice-versa
        'appTopLevelWindow': hex(12345),
    }
    return [uwp_caps, classic_caps, use_existing_app_caps]


@pytest.fixture(params=generate_caps())
def driver(request):
    drv = webdriver.Remote('http://localhost:4723/wd/hub', request.param)
    yield drv
    drv.quit()


def test_app_source_could_be_retrieved(driver):
    assert len(driver.page_source) > 0
```

You could also find more examples for different programming languages at https://github.com/microsoft/WinAppDriver/tree/master/Samples


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
proc_info = driver.execute_script('powerShell', {'command': cmd})
if proc_info:
  print('Outlook is running')
else:
  print('Outlook is not running')
```


## Development

```bash
# Checkout the current repository and run
npm install
```


## Test

You can run unit and e2e tests locally:

```bash
# unit tests
npm run unit-test

# e2e tests
npm run e2e-test
```
