/**
 * An `Error` that represents invalid arguments to a command, tagged with
 * `isInvalidArgumentError` for {@link isInvalidArgumentError} checks.
 *
 * @typedef {Error & {isInvalidArgumentError: true}} InvalidArgumentError
 */

/**
 * Determines whether a caught value is an invalid-argument error created by
 * {@link createInvalidArgumentError}.
 *
 * Gesture handling uses this to decide whether to fall back to another code path
 * or rethrow.
 *
 * @param {*} e - Value under test, typically the object caught from `try`/`catch`.
 * @returns {boolean} Whether `e` has a truthy `isInvalidArgumentError` property.
 *   Returns `false` for `null`, `undefined`, primitives, and other values without
 *   that property (never throws).
 */
export function isInvalidArgumentError(e) {
  return Boolean(e?.isInvalidArgumentError);
}

/**
 * Builds an `Error` that signals invalid caller arguments (e.g. missing
 * coordinates, inconsistent gesture options). The same tag used by
 * {@link isInvalidArgumentError}.
 *
 * @param {string} message - Message explaining what was wrong with the arguments.
 * @returns {InvalidArgumentError} The thrown/shown error, tagged for detection.
 */
export function createInvalidArgumentError(message) {
  const err = new Error(message);
  // @ts-ignore Custom marker used by isInvalidArgumentError; not on the Error typedef.
  err.isInvalidArgumentError = true;
  return /** @type {InvalidArgumentError} */ (err);
}
