/** True for plain objects (including `Object.create(null)`), false for arrays, `Date`, etc. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Assigns own enumerable properties of `source` onto `target` only where `target[key] === undefined`
 * (lodash `defaults` semantics).
 */
export function assignDefaults<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
    if (target[key] === undefined) {
      (target as Record<string, unknown>)[key] = source[key];
    }
  }
}
