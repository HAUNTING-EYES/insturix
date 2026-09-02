import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';

/**
 * A provider-observed object version for an existing MediaAsset locator.
 *
 * This is deliberately narrower than a canonical source identity: R2 ETags
 * and GCS generations let us detect an object changing beneath a stable key,
 * but neither replaces a future immutable byte digest, PTS mapping, proxy map,
 * or ProjectService source binding.
 */
export const MEDIA_SOURCE_STORAGE_VERSION_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_STORAGE_VERSION_V1' as const;

export type MediaSourceStorageLocatorV1 = {
  provider: 'R2' | 'GCS';
  objectKey: string;
};

export type MediaSourceStorageVersionV1 = {
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_STORAGE_VERSION_KIND_V1;
  locator: MediaSourceStorageLocatorV1;
  byteLength: number;
  providerVersion: {
    kind: 'R2_ETAG' | 'GCS_GENERATION';
    value: string;
  };
  storageVersionSha256: string;
};

export type MediaSourceStorageVersionInspectionV1 =
  | { disposition: 'OBSERVED'; storageVersion: MediaSourceStorageVersionV1 }
  | {
      disposition: 'UNVERIFIABLE';
      diagnostic:
        | 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE'
        | 'MEDIA_SOURCE_STORAGE_VERSION_INVALID';
    };

export type MediaSourceStorageVersionInspectionPortsV1 = {
  inspectR2?(objectKey: string): Promise<{ byteLength: number; eTag: string } | null>;
  inspectGcs?(objectKey: string): Promise<{ byteLength: number; generation: string } | null>;
};

/**
 * Creates a stable identity for the provider object version that was actually
 * inspected. The identity contains no URL, user-controlled filename, or
 * observed-at timestamp, so repeated reads of the same object produce the
 * same result.
 */
export function createMediaSourceStorageVersionV1(input: {
  locator: MediaSourceStorageLocatorV1;
  byteLength: number;
  providerVersion: MediaSourceStorageVersionV1['providerVersion'];
}): MediaSourceStorageVersionV1 {
  const locator = normalizeLocator(input.locator);
  const byteLength = positiveSafeInteger(input.byteLength, 'MEDIA_SOURCE_STORAGE_BYTE_LENGTH_INVALID');
  const providerVersion = normalizeProviderVersion(locator.provider, input.providerVersion);
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_STORAGE_VERSION_KIND_V1,
    locator,
    byteLength,
    providerVersion,
  };
  return {
    ...material,
    storageVersionSha256: hashEditronCanonicalJsonV1(material),
  };
}

export function sameMediaSourceStorageVersionV1(
  left: MediaSourceStorageVersionV1,
  right: MediaSourceStorageVersionV1,
): boolean {
  return left.storageVersionSha256 === right.storageVersionSha256
    && hashEditronCanonicalJsonV1(withoutHash(left)) === left.storageVersionSha256
    && hashEditronCanonicalJsonV1(withoutHash(right)) === right.storageVersionSha256;
}

/**
 * Reads one exact provider version. Provider errors and malformed metadata are
 * explicit non-successes; this function never falls back to a browser URL or
 * client-declared size.
 */
export async function inspectMediaSourceStorageVersionV1(
  locator: MediaSourceStorageLocatorV1,
  ports: MediaSourceStorageVersionInspectionPortsV1 = {},
): Promise<MediaSourceStorageVersionInspectionV1> {
  try {
    if (locator.provider === 'R2') {
      const inspectR2 = ports.inspectR2 ?? defaultInspectR2;
      const observed = await inspectR2(locator.objectKey);
      if (!observed) return unavailable();
      return observedVersion(locator, observed.byteLength, {
        kind: 'R2_ETAG',
        value: observed.eTag,
      });
    }

    const inspectGcs = ports.inspectGcs ?? defaultInspectGcs;
    const observed = await inspectGcs(locator.objectKey);
    if (!observed) return unavailable();
    return observedVersion(locator, observed.byteLength, {
      kind: 'GCS_GENERATION',
      value: observed.generation,
    });
  } catch {
    return unavailable();
  }
}

function observedVersion(
  locator: MediaSourceStorageLocatorV1,
  byteLength: number,
  providerVersion: MediaSourceStorageVersionV1['providerVersion'],
): MediaSourceStorageVersionInspectionV1 {
  try {
    return {
      disposition: 'OBSERVED',
      storageVersion: createMediaSourceStorageVersionV1({ locator, byteLength, providerVersion }),
    };
  } catch {
    return { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_INVALID' };
  }
}

async function defaultInspectR2(objectKey: string): Promise<{ byteLength: number; eTag: string } | null> {
  const { readR2ObjectVersionObservationV1 } = await import('./r2-service');
  return readR2ObjectVersionObservationV1(objectKey);
}

async function defaultInspectGcs(objectKey: string): Promise<{ byteLength: number; generation: string } | null> {
  const { readGcsObjectVersionObservationV1 } = await import('./gcs-service');
  return readGcsObjectVersionObservationV1(objectKey);
}

function unavailable(): MediaSourceStorageVersionInspectionV1 {
  return { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE' };
}

function normalizeLocator(value: MediaSourceStorageLocatorV1): MediaSourceStorageLocatorV1 {
  if (value.provider !== 'R2' && value.provider !== 'GCS') {
    throw new Error('MEDIA_SOURCE_STORAGE_PROVIDER_INVALID');
  }
  const objectKey = cleanText(value.objectKey, 512);
  if (!objectKey) throw new Error('MEDIA_SOURCE_STORAGE_OBJECT_KEY_INVALID');
  return { provider: value.provider, objectKey };
}

function normalizeProviderVersion(
  provider: MediaSourceStorageLocatorV1['provider'],
  value: MediaSourceStorageVersionV1['providerVersion'],
): MediaSourceStorageVersionV1['providerVersion'] {
  const expectedKind = provider === 'R2' ? 'R2_ETAG' : 'GCS_GENERATION';
  if (value.kind !== expectedKind) {
    throw new Error('MEDIA_SOURCE_STORAGE_PROVIDER_VERSION_KIND_INVALID');
  }
  const version = cleanText(value.value, 256);
  if (!version) throw new Error('MEDIA_SOURCE_STORAGE_PROVIDER_VERSION_INVALID');
  return { kind: expectedKind, value: version };
}

function positiveSafeInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(code);
  return value;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

function withoutHash(value: MediaSourceStorageVersionV1) {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    locator: value.locator,
    byteLength: value.byteLength,
    providerVersion: value.providerVersion,
  };
}
