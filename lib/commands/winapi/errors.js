export function isInvalidArgumentError(e) {
  return !!e.isInvalidArgumentError;
}

export function createInvalidArgumentError(message) {
  const err = new Error(message);
  // @ts-ignore We want to add a new property
  err.isInvalidArgumentError = true;
  return err;
}
