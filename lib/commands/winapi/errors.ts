/** Error tagged for {@link isInvalidArgumentError} detection (native layer invalid args). */
export type InvalidArgumentError = Error & {isInvalidArgumentError: true};

/**
 * Determines whether a caught value is an invalid-argument error created by
 * {@link createInvalidArgumentError}. Never throws.
 */
export function isInvalidArgumentError(e: unknown): e is InvalidArgumentError {
  return Boolean((e as {isInvalidArgumentError?: unknown})?.isInvalidArgumentError);
}

/**
 * Builds an `Error` that signals invalid caller arguments (e.g. missing
 * coordinates, inconsistent gesture options).
 */
export function createInvalidArgumentError(message: string): InvalidArgumentError {
  const err = new Error(message) as InvalidArgumentError;
  err.isInvalidArgumentError = true;
  return err;
}
