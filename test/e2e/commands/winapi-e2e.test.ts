import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {buildWdIoOptions} from '../helpers.js';
import {remote as wdio} from 'webdriverio';
import type {Browser} from 'webdriverio';

describe('winapi', () => {
  let driver: Browser | null = null;

  before(async () => {
    driver = await wdio(buildWdIoOptions('Root'));
  });

  after(async () => {
    try {
      if (driver) {
        await driver.deleteSession();
      }
    } finally {
      driver = null;
    }
  });

  describe('mouseClick', () => {
    it('performs single click with Shift+Ctrl', async () => {
      await driver!.execute('windows: click', {
        x: 100,
        y: 100,
        modifierKeys: ['shift', 'ctrl'],
      });
    });

    it('performs long click', async () => {
      await driver!.execute('windows: click', {
        x: 100,
        y: 100,
        durationMs: 500,
      });
    });

    it('performs double click', async () => {
      await driver!.execute('windows: click', {
        x: 100,
        y: 100,
        times: 2,
      });
    });

    it('performs context click', async () => {
      await driver!.execute('windows: click', {
        x: 100,
        y: 100,
        button: 'right',
      });
    });

    it('fails if wrong input is provided', async () => {
      const errDatas = [
        // Missing/wrong coordinate
        {y: 10},
        {x: 0},
        {elementId: '1234', y: 10},
        {},
        {x: 10, y: 'yolo'},
        // wrong button name
        {x: 10, y: 10, button: 'yolo'},
        // wrong modifier key name
        {x: 10, y: 10, modifierKeys: 'yolo'},
      ];

      for (const errData of errDatas) {
        await assert.rejects(driver!.execute('windows: click', errData));
      }
    });
  });

  describe('mouseScroll', () => {
    it('performs vertical scroll gesture with Ctrl+Alt depressed', async () => {
      await driver!.execute('windows: scroll', {
        x: 600,
        y: 300,
        deltaY: 200,
        modifierKeys: ['ctrl', 'alt'],
      });
    });

    it('performs horizontal scroll gesture', async () => {
      await driver!.execute('windows: scroll', {
        x: 600,
        y: 300,
        deltaX: -200,
      });
    });

    it('does nothing if zero delta is provided', async () => {
      await driver!.execute('windows: scroll', {
        x: 100,
        y: 100,
        deltaY: 0,
      });
    });

    it('fails if wrong input is provided', async () => {
      const errDatas = [
        // Wrong/missing deltas
        {x: 10, y: 10, deltaX: '10'},
        {x: 10, y: 10, deltaX: 0, deltaY: 40},
        {x: 10, y: 10},
      ];

      for (const errData of errDatas) {
        await assert.rejects(driver!.execute('windows: scroll', errData));
      }
    });
  });

  describe('mouseClickAndDrag', () => {
    it('performs drag gesture with Ctrl+Shift depressed', async () => {
      await driver!.execute('windows: clickAndDrag', {
        startX: 600,
        startY: 300,
        endX: 500,
        endY: 400,
        modifierKeys: ['ctrl', 'shift'],
      });
    });
  });

  describe('windowsHover', () => {
    it('performs hover gesture with Ctrl+Shift depressed', async () => {
      await driver!.execute('windows: clickAndDrag', {
        startX: 600,
        startY: 300,
        endX: 500,
        endY: 400,
        modifierKeys: ['ctrl', 'shift'],
      });
    });
  });

  describe('keys', () => {
    it('performs complex key input', async () => {
      await driver!.execute('windows: keys', {
        actions: [
          {virtualKeyCode: 0x10, down: true},
          {pause: 100},
          {text: 'шевченко'},
          {text: '和製漢字'},
          {pause: 100},
          {virtualKeyCode: 0x10, down: false},
        ],
      });
    });

    it('fails if wrong input is provided', async () => {
      const errDatas = [
        // Wrong properties
        {pause: 10, text: 'sdfd'},
        {},
        // empty text
        {text: ''},
        // down is not boolean
        {virtualKeyCode: 0x10, down: 'false'},
      ];

      for (const errData of errDatas) {
        await assert.rejects(driver!.execute('windows: keys', {actions: [errData]}));
      }
    });
  });
});
