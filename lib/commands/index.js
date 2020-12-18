import generalCmds from './general';
import findCmds from './find';
import recordScreenCmds from './record-screen';
import touchCmds from './touch';
import powerShellCmds from './powershell';
import executeCmds from './execute';

const commands = {};
Object.assign(
  commands,
  executeCmds,
  generalCmds,
  findCmds,
  recordScreenCmds,
  touchCmds,
  powerShellCmds,
  // add other command types here
);

export { commands };
export default commands;
