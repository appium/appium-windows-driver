import { exec } from 'teen_process';
import { errors } from 'appium/driver';
import _ from 'lodash';

/**
 * @typedef {'plaintext' | 'image'} ContentTypeEnum
 */

/**
 * @type { Record<ContentTypeEnum, ContentTypeEnum>}
 */
const CONTENT_TYPE = Object.freeze({
  plaintext: 'plaintext',
  image: 'image',
});

// https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/set-clipboard?view=powershell-7.3

/**
 * Sets the Windows clipboard to the given string or PNG-image.
 *
 * @this {WindowsDriver}
 * @param {string} b64Content base64-encoded clipboard content to set
 * @param {ContentTypeEnum} [contentType='text'] The clipboard content type to set
 */
export async function windowsSetClipboard (
  b64Content,
  contentType = CONTENT_TYPE.plaintext
) {
  if (b64Content && Buffer.from(b64Content, 'base64').toString('base64') !== b64Content) {
    throw new errors.InvalidArgumentError(`The 'b64Content' argument must be a valid base64-encoded string`);
  }
  switch (contentType) {
    case CONTENT_TYPE.plaintext:
      return await exec('powershell', ['-command',
        `$str=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64Content}'));`,
        'Set-Clipboard -Value $str'
      ]);
    case CONTENT_TYPE.image:
      return await exec('powershell', ['-command',
        `$img=[Drawing.Bitmap]::FromStream([IO.MemoryStream][Convert]::FromBase64String('${b64Content}'));`,
        '[System.Windows.Forms.Clipboard]::SetImage($img);',
        '$img.Dispose();'
      ]);
    default:
      throw new errors.InvalidArgumentError(
        `The clipboard content type '${contentType}' is not known. ` +
        `Only the following content types are supported: ${_.values(CONTENT_TYPE)}`
      );
  }
}

// https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-clipboard?view=powershell-7.3

/**
 * Returns the Windows clipboard content as base64-encoded string.
 *
 * @this {WindowsDriver}
 * @property {ContentTypeEnum} [contentType='plaintext'] The clipboard content type to get.
 * Only PNG images are supported for extraction if set to 'image'.
 * @returns {Promise<string>} base64-encoded content of the clipboard
 */
export async function windowsGetClipboard (
  contentType = CONTENT_TYPE.plaintext
) {
  switch (contentType) {
    case CONTENT_TYPE.plaintext: {
      const {stdout} = await exec('powershell', ['-command',
        '$str=Get-Clipboard;',
        '[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($str));'
      ]);
      return _.trim(stdout);
    }
    case CONTENT_TYPE.image: {
      const {stdout} = await exec('powershell', ['-command',
        '$s=New-Object System.IO.MemoryStream;',
        '[System.Windows.Forms.Clipboard]::GetImage().Save($s,[System.Drawing.Imaging.ImageFormat]::Png);',
        '[System.Convert]::ToBase64String($s.ToArray());'
      ]);
      return _.trim(stdout);
    }
    default:
      throw new errors.InvalidArgumentError(
        `The clipboard content type '${contentType}' is not known. ` +
        `Only the following content types are supported: ${_.values(CONTENT_TYPE)}`
      );
  }
}

/**
 * @typedef {import('../driver').WindowsDriver} WindowsDriver
 */
