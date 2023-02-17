export function isInvalidArgumentError(e) {
  return !!e.isInvalidArgumentError;
}

export function createInvalidArgumentError(message) {
  const err = new Error(message);
  err.isInvalidArgumentError = true;
  return err;
}
