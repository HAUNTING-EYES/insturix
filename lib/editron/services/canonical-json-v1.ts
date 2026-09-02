import { createHash } from 'node:crypto';

/** Canonical JSON for production Editron control-plane identities. */
export function canonicalizeEditronJsonV1(value: unknown): string {
  return canonicalize(value);
}

export function hashEditronCanonicalJsonV1(value: unknown): string {
  return createHash('sha256')
    .update(canonicalizeEditronJsonV1(value), 'utf8')
    .digest('hex');
}

/** Hash the JSON document shape that MongoDB persists for optional object fields. */
export function hashEditronPersistedJsonV1(value: unknown): string {
  return hashEditronCanonicalJsonV1(compactPersistedJson(value, false));
}

export function cloneCanonicalEditronJsonV1<T>(value: T): T {
  return JSON.parse(canonicalizeEditronJsonV1(value)) as T;
}

export function deepFreezeEditronJsonV1<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreezeEditronJsonV1(child);
    }
    Object.freeze(value);
  }
  return value;
}

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('EDITRON_JSON_NUMBER_INVALID');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (!value || typeof value !== 'object') {
    throw new Error('EDITRON_JSON_VALUE_INVALID');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('EDITRON_JSON_OBJECT_INVALID');
  }
  const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => ({
    key: key.normalize('NFC'),
    value: entry,
  }));
  if (new Set(entries.map(({ key }) => key)).size !== entries.length) {
    throw new Error('EDITRON_JSON_KEY_NORMALIZATION_COLLISION');
  }
  entries.sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  return `{${entries.map(({ key, value: entry }) => (
    `${JSON.stringify(key)}:${canonicalize(entry)}`
  )).join(',')}}`;
}

function compactPersistedJson(value: unknown, inArray: boolean): unknown {
  if (value === undefined) {
    throw new Error(inArray
      ? 'EDITRON_JSON_ARRAY_UNDEFINED_INVALID'
      : 'EDITRON_JSON_VALUE_INVALID');
  }
  if (Array.isArray(value)) {
    return value.map((entry) => compactPersistedJson(entry, true));
  }
  if (!value || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => [key, compactPersistedJson(entry, false)]));
}
