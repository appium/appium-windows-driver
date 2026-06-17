import {exec} from 'teen_process';
import {errors} from 'appium/driver.js';
import type {WindowsDriver} from '../driver.js';
import type {TeenProcessExecResult} from 'teen_process';

const CONTENT_TYPE = Object.freeze({
  plaintext: 'plaintext',
  image: 'image',
});
type ContentTypeEnum = (typeof CONTENT_TYPE)[keyof typeof CONTENT_TYPE];

// https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/set-clipboard?view=powershell-7.3

/**
 * Sets the Windows clipboard to the given string or PNG-image.
 *
 * @param b64Content - Base64-encoded clipboard content to set
 * @param contentType - Clipboard content type to set (default plain text)
 */
export async function windowsSetClipboard(
  this: WindowsDriver,
  b64Content: string,
  contentType: ContentTypeEnum = CONTENT_TYPE.plaintext,
): Promise<TeenProcessExecResult<string>> {
  if (b64Content && Buffer.from(b64Content, 'base64').toString('base64') !== b64Content) {
    throw new errors.InvalidArgumentError(
      `The 'b64Content' argument must be a valid base64-encoded string`,
    );
  }
  switch (contentType) {
    case CONTENT_TYPE.plaintext:
      return await exec('powershell', [
        '-command',
        `$str=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64Content}'));`,
        'Set-Clipboard -Value $str',
      ]);
    case CONTENT_TYPE.image:
      return await exec('powershell', [
        '-command',
        `$img=[Drawing.Bitmap]::FromStream([IO.MemoryStream][Convert]::FromBase64String('${b64Content}'));`,
        '[System.Windows.Forms.Clipboard]::SetImage($img);',
        '$img.Dispose();',
      ]);
    default:
      throw new errors.InvalidArgumentError(
        `The clipboard content type '${contentType}' is not known. ` +
          `Only the following content types are supported: ${Object.values(CONTENT_TYPE)}`,
      );
  }
}

// https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-clipboard?view=powershell-7.3

/**
 * Returns the Windows clipboard content as a base64-encoded string.
 *
 * @param contentType - Clipboard content type to read (only PNG is supported for `image`)
 */
export async function windowsGetClipboard(
  this: WindowsDriver,
  contentType: ContentTypeEnum = CONTENT_TYPE.plaintext,
): Promise<string> {
  switch (contentType) {
    case CONTENT_TYPE.plaintext: {
      const {stdout} = await exec('powershell', [
        '-command',
        '$str=Get-Clipboard;',
        '[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($str));',
      ]);
      return stdout.trim();
    }
    case CONTENT_TYPE.image: {
      const {stdout} = await exec('powershell', [
        '-command',
        '$s=New-Object System.IO.MemoryStream;',
        '[System.Windows.Forms.Clipboard]::GetImage().Save($s,[System.Drawing.Imaging.ImageFormat]::Png);',
        '[System.Convert]::ToBase64String($s.ToArray());',
      ]);
      return stdout.trim();
    }
    default:
      throw new errors.InvalidArgumentError(
        `The clipboard content type '${contentType}' is not known. ` +
          `Only the following content types are supported: ${Object.values(CONTENT_TYPE)}`,
      );
  }
}
