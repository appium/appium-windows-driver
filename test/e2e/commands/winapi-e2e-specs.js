import { commands } from '../../../lib/commands/gestures';
import log from '../../../lib/logger';


describe('winapi', function () {
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    should = chai.should();
    chai.use(chaiAsPromised.default);
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

    it('performs double click', async function () {
      await commands.windowsClick({
        x: 100,
        y: 100,
        times: 2,
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

  describe('mouseClickAndDrag', function () {
    it('performs drag gesture with Ctrl+Shift depressed', async function () {
      await commands.windowsClickAndDrag({
        startX: 600,
        startY: 300,
        endX: 500,
        endY: 400,
        modifierKeys: ['ctrl', 'shift'],
      });
    });
  });

  describe('windowsHover', function () {
    it('performs hover gesture with Ctrl+Shift depressed', async function () {
      await commands.windowsHover({
        startX: 600,
        startY: 300,
        endX: 500,
        endY: 400,
        modifierKeys: ['ctrl', 'shift'],
      });
    });
  });

  describe('keys', function () {
    it('performs complex key input', async function () {
      await commands.windowsKeys({
        actions: [
          {virtualKeyCode: 0x10, down: true},
          {pause: 100},
          {text: 'шевченко'},
          {text: '和製漢字'},
          {pause: 100},
          {virtualKeyCode: 0x10, down: false},
        ]
      });
    });

    it('fails if wrong input is provided', async function () {
      const errDatas = [
        // Wrong properties
        {
          pause: 10,
          text: 'sdfd',
        },
        {},
        // empty text
        {
          text: '',
        },
        // down is not boolean
        {
          virtualKeyCode: 0x10,
          down: 'false'
        },
      ];

      for (const errData of errDatas) {
        await commands.windowsKeys(errData).should.be.rejected;
      }
    });
  });

});
