const commands = {};
const fs = require('fs');
//This is needed to make clicks on -image elements work properly
commands.performActions = async function (actions) {
  fs.writeFile('C:/logs/log.txt', actions, err => {
    if (err) {
      console.error(err);
    }
  });
  return await this.winAppDriver.sendCommand('/actions', 'POST', {actions});
};

Object.assign(commands);
export default commands;
