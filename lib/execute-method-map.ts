import type { ExecuteMethodMap } from '@appium/types';
import type { WindowsDriver } from './driver';

export const executeMethodMap = {
  'windows: startRecordingScreen': {
    // @ts-ignore Type checked is confused
    command: 'windowsStartRecordingScreen',
    params: {
      optional: [
        'timeLimit',
        'videoFilter',
        'fps',
        'preset',
        'captureCursor',
        'captureClicks',
        'audioInput',
        'forceRestart',
      ],
    },
  },
  'windows: stopRecordingScreen': {
    command: 'windowsStopRecordingScreen',
    params: {
      optional: [
        'remotePath',
        'user',
        'pass',
        'method',
        'headers',
        'fileFieldName',
        'formFields',
      ],
    },
  },

  'windows: launchApp': {
    command: 'windowsLaunchApp',
  },
  'windows: closeApp': {
    command: 'windowsCloseApp',
  },

  'windows: deleteFolder': {
    command: 'windowsDeleteFolder',
    params: {
      required: [
        'remotePath',
      ],
    },
  },
  'windows: deleteFile': {
    command: 'windowsDeleteFile',
    params: {
      required: [
        'remotePath',
      ],
    },
  },


  'windows: click': {
    command: 'windowsClick',
    params: {
      optional: [
        'elementId',
        'x',
        'y',
        'button',
        'modifierKeys',
        'durationMs',
        'times',
        'interClickDelayMs',
      ],
    },
  },
  'windows: scroll': {
    command: 'windowsScroll',
    params: {
      optional: [
        'elementId',
        'x',
        'y',
        'deltaX',
        'deltaY',
        'modifierKeys',
      ],
    },
  },
  'windows: clickAndDrag': {
    command: 'windowsClickAndDrag',
    params: {
      optional: [
        'startElementId',
        'startX',
        'startY',
        'endElementId',
        'endX',
        'endY',
        'modifierKeys',
        'durationMs',
      ],
    },
  },
  'windows: hover': {
    command: 'windowsHover',
    params: {
      optional: [
        'startElementId',
        'startX',
        'startY',
        'endElementId',
        'endX',
        'endY',
        'modifierKeys',
        'durationMs',
      ],
    },
  },
  'windows: keys': {
    command: 'windowsKeys',
    params: {
      required: [
        'actions',
      ],
    },
  },

  'windows: setClipboard': {
    command: 'windowsSetClipboard',
    params: {
      required: [
        'b64Content',
      ],
      optional: [
        'contentType',
      ],
    },
  },
  'windows: getClipboard': {
    command: 'windowsGetClipboard',
    params: {
      optional: [
        'contentType',
      ],
    },
  },
} as const satisfies ExecuteMethodMap<WindowsDriver>;
