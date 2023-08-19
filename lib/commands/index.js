import generalCmds from './general';
import findCmds from './find';
import recordScreenCmds from './record-screen';
import touchCmds from './touch';
import powerShellCmds from './powershell';
import executeCmds from './execute';
import fileMovementExtensions from './file-movement';
import appManagementExtensions from './app-management';
import gesturesCmds from './gestures';
import clipboardCmds from './clipboard';


const commands = {};
Object.assign(
  commands,
  executeCmds,
  generalCmds,
  findCmds,
  recordScreenCmds,
  touchCmds,
  powerShellCmds,
  fileMovementExtensions,
  appManagementExtensions,
  gesturesCmds,
  clipboardCmds,
  // add other command types here
);

export { commands };
export default commands;
