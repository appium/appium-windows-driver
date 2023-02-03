const commands = {};
//This is needed to make clicks on -image elements work properly
commands.performActions = async function (actions) {
  switch (actions[0].id) {
    case 'default keyboard':
      this.log.info('Mapping keyboard actions');
      return await performKeyboardCommands.bind(this)(actions[0].actions);
    case 'default mouse':
      this.log.info('Mapping mouse actions');
      return await performMouseCommands.bind(this)(actions[0].actions);
    default:
      this.log.info('Going default actions route');
      return await this.winAppDriver.sendCommand('/actions', 'POST', {actions});
  };
};

async function performKeyboardCommands(actions) {
  const keysFormatted = formatKeyboardInput(actions);
  return await this.winAppDriver.sendCommand('/keys', 'POST', {'value': keysFormatted });
}

async function performMouseCommands(actions) {
  let result;
  for (const action in actions) {
    switch (actions[action].type) {
      case 'pointerMove':
        result = await this.winAppDriver.sendCommand('/moveto', 'POST', {'element': actions[action].origin.ELEMENT });
        break;
      case 'pointerDown':
        result = await this.winAppDriver.sendCommand('/buttondown', 'POST', {'button': actions[action].button });
        break;
      case 'pointerUp':
        result = await this.winAppDriver.sendCommand('/buttonup', 'POST', {'button': actions[action].button });
        break;
      default:
        this.log.info('No mouse action mapped for type: ' + JSON.stringify(actions[action].type) + ' Moving to next action');
    }
  };
  return result;
}

function formatKeyboardInput(actions) {
  const keys = new Array();
  actions.forEach((action) => {
    if (action.type === 'keyDown') {
      keys.push(action.value);
    }
  });
  return [keys.join('')];
}

Object.assign(commands);
export default commands;