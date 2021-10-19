import { parseRegQueryOutput } from '../../lib/registry';
import chai from 'chai';

chai.should();

describe('registry', function () {
  it('should parse reg query output', function () {
    const output = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AddressBook

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Connection Manager
    SystemComponent    REG_DWORD    0x1

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DirectDrawEx

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DXM_Runtime

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Fontcore

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\IE40

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\IE4Data

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\IE5BAKEX

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\IEData

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MobileOptionPack

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MPlayer2

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SchedulingAgent

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\WIC
    NoRemove    REG_DWORD    0x1

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{12B6D916-FD64-471C-8EF7-C04443A75F8D}
    AuthorizedCDFPrefix    REG_SZ
    Comments    REG_SZ
    Contact    REG_SZ
    DisplayVersion    REG_SZ    40.28.30105
    HelpLink    REG_SZ
    HelpTelephone    REG_SZ
    InstallDate    REG_SZ    20211019
    InstallLocation    REG_SZ
    InstallSource    REG_SZ    C:\\ProgramData\\Package Cache\\{12B6D916-FD64-471C-8EF7-C04443A75F8D}v40.28.30105\\
    ModifyPath    REG_EXPAND_SZ    MsiExec.exe /X{12B6D916-FD64-471C-8EF7-C04443A75F8D}
    NoModify    REG_DWORD    0x1
    Publisher    REG_SZ    Microsoft Corporation
    Readme    REG_SZ
    Size    REG_SZ
    EstimatedSize    REG_DWORD    0x16c
    SystemComponent    REG_DWORD    0x1
    UninstallString    REG_EXPAND_SZ    MsiExec.exe /X{12B6D916-FD64-471C-8EF7-C04443A75F8D}
    URLInfoAbout    REG_SZ
    URLUpdateInfo    REG_SZ
    VersionMajor    REG_DWORD    0x28
    VersionMinor    REG_DWORD    0x1c
    WindowsInstaller    REG_DWORD    0x1
    Version    REG_DWORD    0x281c7599
    Language    REG_DWORD    0x409
    DisplayName    REG_SZ    Microsoft .NET Host - 5.0.7 (x64)

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{29DA7679-80B6-452A-B264-349BAEE7CC0E}
    AuthorizedCDFPrefix    REG_SZ
    Comments    REG_SZ
    Contact    REG_SZ
    DisplayVersion    REG_SZ    1.2.99.0
    HelpLink    REG_SZ
    HelpTelephone    REG_SZ
    InstallDate    REG_SZ    20211019
    InstallLocation    REG_SZ
    InstallSource    REG_SZ    C:\\ProgramData\\Package Cache\\{29DA7679-80B6-452A-B264-349BAEE7CC0E}v1.2.99.0\\
    ModifyPath    REG_EXPAND_SZ    MsiExec.exe /I{29DA7679-80B6-452A-B264-349BAEE7CC0E}
    Publisher    REG_SZ    Microsoft Corporation
    Readme    REG_SZ
    Size    REG_SZ
    EstimatedSize    REG_DWORD    0x6fd8
    SystemComponent    REG_DWORD    0x1
    UninstallString    REG_EXPAND_SZ    MsiExec.exe /I{29DA7679-80B6-452A-B264-349BAEE7CC0E}
    URLInfoAbout    REG_SZ
    URLUpdateInfo    REG_SZ
    VersionMajor    REG_DWORD    0x1
    VersionMinor    REG_DWORD    0x2
    WindowsInstaller    REG_DWORD    0x1
    Version    REG_DWORD    0x1020063
    Language    REG_DWORD    0x409
    DisplayName    REG_SZ    Windows Application Driver

    `;
    const result = parseRegQueryOutput(output);
    Boolean(result.find(
      ({root, key, type, value}) => root === 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{29DA7679-80B6-452A-B264-349BAEE7CC0E}'
        && key === 'DisplayName' && type === 'REG_SZ' && value === 'Windows Application Driver'
    )).should.be.true;
  });
  it('should return empty array if no matches found', function () {
    const output = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AddressBook

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DirectDrawEx
    `;
    const result = parseRegQueryOutput(output);
    result.length.should.be.eql(0);
  });
});
