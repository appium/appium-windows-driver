import { errors } from 'appium/driver';

const WINDOWS_CONTEXT = 'NATIVE_APP';

export async function getContexts (): Promise<string[]> {
  return [WINDOWS_CONTEXT];
}

export async function getCurrentContext (): Promise<string> {
  return WINDOWS_CONTEXT;
}

export async function setContext (context: string): Promise<void> {
  if (context !== WINDOWS_CONTEXT) {
    throw new errors.NoSuchContextError(
      `The Windows Driver only supports '${WINDOWS_CONTEXT}' context.`
    );
  }
}