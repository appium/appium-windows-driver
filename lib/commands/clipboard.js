import { exec } from 'teen_process';
import { errors } from 'appium/driver';
import { requireArgs } from '../utils';
import _ from 'lodash';

const commands = {};

const CONTENT_TYPE = Object.freeze({
  TEXT: 'text',
  IMAGE: 'image',
});

// https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/set-clipboard?view=powershell-7.3

/**
 * @typedef {Object} SetClipboardOptions
 * @property {string} b64Content base64-encoded clipboard content to set
 * @property {'text' | 'image'} contentType [text] The clipboard content type to set
 */

/**
 * Sets the Windows clipboard to the given string or PNG-image.
 *
 * @param {Partial<SetClipboardOptions>} opts
 */
commands.windowsSetClipboard = async function windowsSetClipboard (opts = {}) {
  const {
    b64Content,
    contentType = CONTENT_TYPE.TEXT,
  } = requireArgs(['b64Content'], opts);
  if (b64Content && Buffer.from(b64Content, 'base64').toString('base64') !== b64Content || !b64Content) {
    throw new errors.InvalidArgumentError(
      `The 'b64Content' argument must be a valid non-empty base64-encoded string`
    );
  }
  switch (contentType) {
    case CONTENT_TYPE.TEXT:
      return await exec('powershell', ['-command',
        `$str=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64Content}'));`,
        'Set-Clipboard -Value $str'
      ]);
    case CONTENT_TYPE.IMAGE:
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
};

// https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-clipboard?view=powershell-7.3

/**
 * @typedef {Object} GetClipboardOptions
 * @property {('text' | 'image')?} contentType [text] The clipboard content type to get.
 * Only PNG images are supported for extraction if set to 'image'.
 */

/**
 * Returns the Windows clipboard content as base64-encoded string.
 *
 * @param {Partial<GetClipboardOptions>} opts
 * @returns {Promise<string>} base64-encoded content of the clipboard
 */
commands.windowsGetClipboard = async function windowsGetClipboard (opts = {}) {
  const {
    contentType = CONTENT_TYPE.TEXT,
  } = opts;
  switch (contentType) {
    case CONTENT_TYPE.TEXT: {
      const {stdout} = await exec('powershell', ['-command',
        '$str=Get-Clipboard;',
        '[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($str));'
      ]);
      return _.trim(stdout);
    }
    case CONTENT_TYPE.IMAGE: {
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
};

export { commands };
export default commands;
