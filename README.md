Appium Windows Driver
===================

Appium Windows Driver is a test automation tool for Windows devices and acts as a proxy to Microsoft's [WinAppDriver server](https://github.com/microsoft/WinAppDriver). Appium Windows Driver supports testing Universal Windows Platform (UWP), Windows Forms (WinForms), Windows Presentation Foundation (WPF), and Classic Windows (Win32) apps on Windows 10 PCs. The server itself is maintained by Microsoft at https://github.com/microsoft/WinAppDriver. Check its [release notes](https://github.com/microsoft/WinAppDriver/releases) and the [vendor documentation](https://github.com/microsoft/WinAppDriver/tree/master/Docs) to get more details on the supported features and possible pitfalls.


## Usage

Beside of standard Appium requirements Appium Windows Driver adds the following prerequisites:

- Appium Windows Driver only supports Windows 10 as the host.
- [Developer mode](https://docs.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development) must be enabled
- Appium downloads and installs WinAppDriver package automatically upon executing its installation scripts, although, the actual binary version could be out of date. In such case you could download and install the most recent version of WinAppDriver manually from the [GitHub releases](https://github.com/microsoft/WinAppDriver/releases) page.

Appium Windows Driver supports the following capabilities:

Capability Name | Description
--- | ---
platformName | Must be set to `windows` (case-insensitive).
automationName | Must be set to `windows` (case-insensitive).
app | The name of the UWP application to test or full path to a classic app, for example `Microsoft.WindowsCalculator_8wekyb3d8bbwe!App` or `C:\Windows\System32\notepad.exe`. It is also possible to set `app` to `Root`. In such case the session will be invoked without any explicit target application (actually, it will be Explorer). Either this capability or `appTopLevelWindow` must be provided on session startup.
appArguments | Application arguments string, for example `/?`.
appTopLevelWindow | The hexadecimal handle of an existing application top level window to attach to, for example `0x12345` (should be of string type). Either this capability or `app` must be provided on session startup.
appWorkingDir | Full path to the folder, which is going to be set as the working dir for the application under test. This is only applicable for classic apps.
createSessionTimeout | Timeout in milliseconds used to retry Appium Windows Driver session startup. This capability could be used as a workaround for the long startup times of UWP applications (aka `Failed to locate opened application window with appId: TestCompany.my_app4!App, and processId: 8480`). Default value is `20000`.
ms:waitForAppLaunch | Similar to `createSessionTimeout`, but in seconds and is applied on the server side. Enables Appium Windows Driver to wait for a defined amount of time after an app launch is initiated prior to attaching to the application session. The limit for this is 50 seconds.
ms:experimental-webdriver | Enables experimental features and optimizations. See Appium Windows Driver release notes for more details on this capability. `false` by default.
systemPort | The port number to execute Appium Windows Driver server listener on, for example `5556`. The port must not be occupied. The default starting port number for a new Appium Windows Driver session is `4724`. If this port is already busy then the next free port will be automatically selected.
prerun | An object containing either `script` or `command` key. The value of each key must be a valid PowerShell script or command to be executed prior to the WinAppDriver session startup. See [Power Shell commands execution](#power-shell-commands-execution) for more details. Example: `{script: 'Get-Process outlook -ErrorAction SilentlyContinue'}`
postrun | An object containing either `script` or `command` key. The value of each key must be a valid PowerShell script or command to be executed after WinAppDriver session is stopped. See [Power Shell commands execution](#power-shell-commands-execution) for more details.

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
        # How to get the app ID for Universal Windows Apps (UWP):
        # https://www.securitylearningacademy.com/mod/book/view.php?id=13829&chapterid=678
        'app': 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
    }
    classic_caps = {
        **common_caps,
        'app': 'C:\\Windows\\System32\\notepad.exe',
        # Make sure arguments are quoted/escaped properly if necessary:
        # https://ss64.com/nt/syntax-esc.html
        'appArguments': 'D:\\log.txt',
        'appWorkingDir': 'D:\\',
    }
    use_existing_app_caps: {
        **common_caps,
        # Active window handles could be retrieved from any compatible UI inspector app:
        # https://docs.microsoft.com/en-us/windows/win32/winauto/inspect-objects
        # or https://accessibilityinsights.io/.
        # Also, it is possible to use the corresponding WinApi calls for this purpose:
        # https://referencesource.microsoft.com/#System/services/monitoring/system/diagnosticts/ProcessManager.cs,db7ac68b7cb40db1
        #
        # This capability could be used to create a workaround for UWP apps startup:
        # https://github.com/microsoft/WinAppDriver/blob/master/Samples/C%23/StickyNotesTest/StickyNotesSession.cs
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

You could find more examples for different programming languages at https://github.com/microsoft/WinAppDriver/tree/master/Samples


## Power Shell commands execution

Since version 1.15.0 of the driver there is a possibility to run custom Power Shell scripts
from your client code. This feature is potentially insecure and thus needs to be
explicitly enabled when executing the server by providing `power_shell` key to the list
of enabled insecure features. Refer to [Appium Security document](https://github.com/appium/appium/blob/master/docs/en/writing-running-appium/security.md) for more details.
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


## Platform-Specific Extensions

Beside of standard W3C APIs the driver provides the following custom command extensions to execute platform specific scenarios:

### windows: startRecordingScreen

Record the display in background while the automated test is running. This method requires [FFMPEG](https://www.ffmpeg.org/download.html) to be installed and present in PATH. The resulting video uses H264 codec and is ready to be played by media players built-in into web browsers.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
videoFilter | string | no | The video filter spec to apply for ffmpeg. See https://trac.ffmpeg.org/wiki/FilteringGuide for more details on the possible values. | Set it to `scale=ifnot(gte(iw\,1024)\,iw\,1024):-2` in order to limit the video width to 1024px. The height will be adjusted automatically to match the actual ratio.
fps | number | no | The count of frames per second in the resulting video. The greater fps it has the bigger file size is. The default vale is `15` | 10
preset | string | no | One of the supported encoding presets. Possible values are: `ultrafast`, `superfast`, `veryfast` (the default value), `faster`, `fast`, `medium`, `slow`, `slower`, `veryslow`. A preset is a collection of options that will provide a certain encoding speed to compression ratio. A slower preset will provide better compression (compression is quality per filesize). This means that, for example, if you target a certain file size or constant bit rate, you will achieve better quality with a slower preset. Read https://trac.ffmpeg.org/wiki/Encode/H.264 for more details. | fast
captureCursor | boolean | no | Whether to capture the mouse cursor while recording the screen. `false` by default | true
captureClicks | boolean | no | Whether to capture mouse clicks while recording the screen. `false` by default | true
timeLimit | number | no | The maximum recording time, in seconds. The default value is 600 seconds (10 minutes) | 300
forceRestart | boolean | no | Whether to ignore the call if a screen recording is currently running (`false`) or to start a new recording immediately and terminate the existing one if running (`true`, the default value). | true

### windows: stopRecordingScreen

Stop recording the screen. If no screen recording has been started before then the method returns an empty string.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
remotePath | string | no | The path to the remote location, where the resulting video should be uploaded. The following protocols are supported: http/https, ftp. Null or empty string value (the default setting) means the content of resulting file should be encoded as Base64 and passed as the endpoint response value. An exception will be thrown if the generated media file is too big to fit into the available process memory. | https://myserver.com/upload/video.mp4
user | string | no | The name of the user for the remote authentication. | myname
pass | string | no | The password for the remote authentication. | mypassword
method | string | no | The http multipart upload method name. The 'PUT' one is used by default. | POST
headers | map | no | Additional headers mapping for multipart http(s) uploads | `{"header": "value"}`
fileFieldName | string | no | The name of the form field, where the file content BLOB should be stored for http(s) uploads. `file` by default | payload
formFields | Map or `Array<Pair>` | no | Additional form fields for multipart http(s) uploads | `{"field1": "value1", "field2": "value2"}` or `[["field1", "value1"], ["field2", "value2"]]`

#### Returns

Base64-encoded content of the recorded media file if `remotePath` parameter is falsy or an empty string.

### windows: deleteFile

Remove the file from the file system. This feature is potentially insecure and thus needs to be
explicitly enabled when executing the server by providing `modify_fs` key to the list
of enabled insecure features. Refer to [Appium Security document](https://github.com/appium/appium/blob/master/docs/en/writing-running-appium/security.md) for more details.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
remotePath | string | yes | The path to a file. The path may contain environment variables that could be expanded on the server side. Due to security reasons only variables listed below would be expanded: `APPDATA`, `LOCALAPPDATA`, `PROGRAMFILES`, `PROGRAMFILES(X86)`, `PROGRAMDATA`, `ALLUSERSPROFILE`, `TEMP`, `TMP`, `HOMEPATH`, `USERPROFILE`, `PUBLIC` | `%HOMEPATH%\\SomeFile.txt` or `C:\\Users\\user\\SomeFile.txt`


### windows: deleteFolder

Remove the folder from the file system. This feature is potentially insecure and thus needs to 
be explicitly enabled when executing the server by providing `modify_fs` key to the list
of enabled insecure features. Refer to [Appium Security document](https://github.com/appium/appium/blob/master/docs/en/writing-running-appium/security.md) for more details.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
remotePath | string | yes | The path to a folder. The path may contain environment variables that could be expanded on the server side. Due to security reasons only variables listed below would be expanded: `APPDATA`, `LOCALAPPDATA`, `PROGRAMFILES`, `PROGRAMFILES(X86)`, `PROGRAMDATA`, `ALLUSERSPROFILE`, `TEMP`, `TMP`, `HOMEPATH`, `USERPROFILE`, `PUBLIC` | `%HOMEPATH%\\SomeFolder\\` or `C:\\Users\\user\\SomeFolder\\`

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
