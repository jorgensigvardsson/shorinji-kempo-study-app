// Structural equality for the plain JSON-shaped values the app stores and syncs.
//
// This replaces comparing two values by their JSON.stringify output, which is
// key-order sensitive: two devices that built the same object in a different property
// order compared as different, and the merge read that as a genuine disagreement and
// asked the user which device was right. Rare, confusing, and near-impossible to
// reproduce on purpose.
//
// Deliberately narrow. Everything it compares comes from JSON.parse or from object
// literals of the same shape, so there are no Dates, Maps, Sets, class instances or
// cycles to think about. Widening it later means widening the tests with it.
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  // Object.is separates +0 from -0, which JSON does not, and no caller here means to.
  if (typeof a === "number" && typeof b === "number") return a === b || (Number.isNaN(a) && Number.isNaN(b));

  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  // A key explicitly set to undefined and a key that is absent are treated as the same
  // thing, because JSON.stringify did and the stored documents rely on it —
  // `kenshiNumber: undefined` is how "not set" is spelled in the default document.
  const leftKeys = definedKeys(left);
  const rightKeys = definedKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every(key =>
    Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]));
}

function definedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter(key => value[key] !== undefined);
}
