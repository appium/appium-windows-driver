import {errors} from 'appium/driver';

const WINDOWS_CONTEXT = 'NATIVE_APP';

/** @returns The list of available contexts (Windows driver only supports native). */
export async function getContexts(): Promise<string[]> {
  return [WINDOWS_CONTEXT];
}

/** @returns The current context name. */
export async function getCurrentContext(): Promise<string> {
  return WINDOWS_CONTEXT;
}

/** @param context - Context name; only the native `NATIVE_APP` context is supported. */
export async function setContext(context: string): Promise<void> {
  if (context !== WINDOWS_CONTEXT) {
    throw new errors.NoSuchContextError(
      `The Windows Driver only supports '${WINDOWS_CONTEXT}' context.`,
    );
  }
}
