// https://github.com/microsoft/WinAppDriver/blob/master/Docs/SupportedAPIs.md

export const newMethodMap = /** @type {const} */ ({
  '/session/:sessionId/appium/start_recording_screen': {
    POST: {
      command: 'startRecordingScreen',
      payloadParams: { optional: ['options'] }
    }
  },
  '/session/:sessionId/appium/stop_recording_screen': {
    POST: {
      command: 'stopRecordingScreen',
      payloadParams: { optional: ['options'] }
    }
  },
  '/session/:sessionId/appium/device/push_file': {
    POST: {command: 'pushFile', payloadParams: {required: ['path', 'data']}},
  },
  '/session/:sessionId/appium/device/pull_file': {
    POST: {command: 'pullFile', payloadParams: {required: ['path']}},
  },
  '/session/:sessionId/appium/device/pull_folder': {
    POST: {command: 'pullFolder', payloadParams: {required: ['path']}},
  },
  '/session/:sessionId/window/:windowhandle/size': {
    GET: {command: 'getWindowSize'},
    POST: {},
  },
  '/session/:sessionId/window/:windowhandle/position': {
    POST: {},
    GET: {},
  },
  '/session/:sessionId/window_handle': {
    GET: {command: 'getWindowHandle'},
  },
  '/session/:sessionId/window_handles': {
    GET: {command: 'getWindowHandles'},
  },
  '/session/:sessionId/appium/app/launch': {
    POST: {command: 'launchApp'},
  },
  '/session/:sessionId/appium/app/close': {
    POST: {command: 'closeApp'},
  },
  '/session/:sessionId/click': {
    POST: {command: 'clickCurrent', payloadParams: {optional: ['button']}},
  },
  '/session/:sessionId/buttondown': {
    POST: {command: 'buttonDown', payloadParams: {optional: ['button']}},
  },
  '/session/:sessionId/buttonup': {
    POST: {command: 'buttonUp', payloadParams: {optional: ['button']}},
  },
  '/session/:sessionId/doubleclick': {
    POST: {command: 'doubleClick'},
  },
  '/session/:sessionId/touch/click': {
    POST: { command: 'click', payloadParams: { required: ['element'] } }
  },
  '/session/:sessionId/touch/down': {
    POST: { command: 'touchDown', payloadParams: { required: ['x', 'y'] } }
  },
  '/session/:sessionId/touch/up': {
    POST: { command: 'touchUp', payloadParams: { required: ['x', 'y'] } }
  },
  '/session/:sessionId/touch/move': {
    POST: { command: 'touchMove', payloadParams: { required: ['x', 'y'] } }
  },
  '/session/:sessionId/touch/longclick': {
    POST: {
      command: 'touchLongClick',
      payloadParams: { required: ['elements'] }
    }
  },
  '/session/:sessionId/touch/flick': {
    POST: {
      command: 'flick',
      payloadParams: {
        optional: [
          'element',
          'xspeed',
          'yspeed',
          'xoffset',
          'yoffset',
          'speed'
        ]
      }
    }
  },
  '/session/:sessionId/touch/perform': {
    POST: {
      command: 'performTouch',
      payloadParams: { wrap: 'actions', required: ['actions'] }
    }
  },
  '/session/:sessionId/touch/multi/perform': {
    POST: {
      command: 'performMultiAction',
      payloadParams: { required: ['actions'], optional: ['elementId'] }
    }
  },
  '/session/:sessionId/keys': {
    POST: {command: 'keys', payloadParams: {required: ['value']}},
  },
  '/session/:sessionId/element/:elementId/location': {
    GET: {command: 'getLocation'},
  },
  '/session/:sessionId/element/:elementId/location_in_view': {
    GET: {command: 'getLocationInView'},
  },
  '/session/:sessionId/element/:elementId/size': {
    GET: {command: 'getSize'},
  },
  '/session/:sessionId/element/:elementId/equals/:otherId': {
    GET: {command: 'equalsElement'},
  },
});
