//This is needed to make clicks on -image elements work properly
import type {WindowsDriver} from '../driver';

/** Forwards W3C actions to WinAppDriver (needed for `-image` locator clicks). */
export async function performActions(
  this: WindowsDriver,
  actions: any,
): Promise<void> {
  await this.winAppDriver.sendCommand('/actions', 'POST', {actions});
}
