import findCmds from './find';
import recordScreenCmds from './record-screen';

const commands = {};
Object.assign(
  commands,
  findCmds,
  recordScreenCmds,
  // add other command types here
);

export { commands };
export default commands;
