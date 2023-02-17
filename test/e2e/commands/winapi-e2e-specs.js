import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { commands } from '../../../lib/commands/gestures';
import log from '../../../lib/logger';


chai.should();
chai.use(chaiAsPromised);

describe('winapi', function () {
  before(function () {
    commands.log = log;
  });
  after(function () {
    delete commands.log;
  });

  describe('mouseClick', function () {
    it('performs single click with Shift+Ctrl', async function () {
      await commands.windowsClick({
        x: 100,
        y: 100,
        modifierKeys: ['shift', 'ctrl'],
      });
    });

    it('performs long click', async function () {
      await commands.windowsClick({
        x: 100,
        y: 100,
        durationMs: 500,
      });
    });

    it('performs context click', async function () {
      await commands.windowsClick({
        x: 100,
        y: 100,
        button: 'right',
      });
    });

    it('fails if wrong input is provided', async function () {
      const errDatas = [
        // Missing/wrong coordinate
        {
          y: 10,
        },
        {
          x: 0,
        },
        {
          elementId: '1234',
          y: 10,
        },
        {},
        {
          x: 10,
          y: 'yolo',
        },
        // wrong button name
        {
          x: 10,
          y: 10,
          button: 'yolo',
        },
        // wrong modifier key name
        {
          x: 10,
          y: 10,
          modifierKeys: 'yolo',
        },
      ];

      for (const errData of errDatas) {
        await commands.windowsClick(errData).should.be.rejected;
      }
    });
  });

  describe('mouseScroll', function () {
    it('performs vertical scroll gesture with Ctrl+Alt depressed', async function () {
      await commands.windowsScroll({
        x: 600,
        y: 300,
        deltaY: 200,
        modifierKeys: ['ctrl', 'alt'],
      });
    });

    it('performs horizontal scroll gesture', async function () {
      await commands.windowsScroll({
        x: 600,
        y: 300,
        deltaX: -200,
      });
    });

    it('does nothing if zero delta is provided', async function () {
      await commands.windowsScroll({
        x: 100,
        y: 100,
        deltaY: 0,
      });
    });

    it('fails if wrong input is provided', async function () {
      const errDatas = [
        // Wrong/missing deltas
        {
          x: 10,
          y: 10,
          deltaX: '10',
        },
        {
          x: 10,
          y: 10,
          deltaX: 0,
          deltaY: 40,
        },
        {
          x: 10,
          y: 10,
        },
      ];

      for (const errData of errDatas) {
        await commands.windowsScroll(errData).should.be.rejected;
      }
    });
  });

});
