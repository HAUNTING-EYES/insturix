export class StorageOwnershipError extends Error {
  constructor(
    message: string,
    public readonly status = 403,
  ) {
    super(message);
    this.name = "StorageOwnershipError";
  }
}

function stripTrailingSlash(value: string | undefined): string | undefined {
  return value?.replace(/\/$/, "");
}

function decodeStorageKey(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new StorageOwnershipError("Malformed storage key", 400);
  }
}

function assertSafeStorageKey(key: string): string {
  const normalized = key.trim().replace(/^\/+/, "");

  if (
    !normalized ||
    normalized.includes("\\") ||
    normalized.includes("..") ||
    /[\x00-\x1F\x7F]/.test(normalized)
  ) {
    throw new StorageOwnershipError("Invalid storage key", 400);
  }

  return normalized;
}

export function sanitizeStorageFilename(filename: unknown): string {
  const safeName = String(filename ?? "upload")
    .replace(/[\\/:*?"<>|\x00-\x1F\x7F]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\.\.+/g, ".")
    .replace(/^\.+/, "")
    .slice(0, 180)
    .trim();

  return safeName && safeName !== "." && safeName !== ".." ? safeName : "upload";
}

export function getUploaderXUserStoragePrefix(userId: string): string {
  return `uploads/${userId}/`;
}

export function buildUploaderXStorageKey(userId: string, uploadId: string, filename: unknown): string {
  return `${getUploaderXUserStoragePrefix(userId)}${uploadId}-${sanitizeStorageFilename(filename)}`;
}

export function requireUploaderXOwnedStorageKey(userId: string, value: string): string {
  const key = assertSafeStorageKey(normalizeStorageKey(value));
  const expectedPrefix = getUploaderXUserStoragePrefix(userId);

  if (!key.startsWith(expectedPrefix)) {
    throw new StorageOwnershipError("Storage key is not owned by the authenticated user");
  }

  return key;
}

export function getClickatronUserStoragePrefixes(userId: string): string[] {
  const prefixedByManager = `user_${userId}/clickatron-`;
  const alreadyPrefixed = userId.startsWith("user_") ? `${userId}/clickatron-` : "";
  return [prefixedByManager, alreadyPrefixed].filter(Boolean);
}

export function buildClickatronStorageKey(userId: string, uploadId: string, filename: unknown): string {
  return `${getClickatronUserStoragePrefixes(userId)[0]}uploads/${uploadId}/${sanitizeStorageFilename(filename)}`;
}

export function requireClickatronOwnedStorageKey(userId: string, value: string): string {
  const key = assertSafeStorageKey(normalizeStorageKey(value));
  const ownedPrefixes = getClickatronUserStoragePrefixes(userId);

  if (!ownedPrefixes.some((prefix) => key.startsWith(prefix))) {
    throw new StorageOwnershipError("Storage key is not owned by the authenticated user");
  }

  return key;
}

export function getKnownImageProxyStoragePrefixes(userId: string): string[] {
  const normalizedUserStorageId = userId.startsWith("user_") ? userId : `user_${userId}`;
  return Array.from(new Set([
    ...getClickatronUserStoragePrefixes(userId),
    getUploaderXUserStoragePrefix(userId),
    `editron/${userId}/media/`,
    `socialize/banners/user_${userId}/`,
    `socialize/banners/${normalizedUserStorageId}/`,
    `${normalizedUserStorageId}/alyzitron-uploads/`,
  ]));
}

export function requireKnownImageProxyStorageKey(userId: string, value: string): string {
  const key = assertSafeStorageKey(normalizeStorageKey(value));
  const ownedPrefixes = getKnownImageProxyStoragePrefixes(userId);

  if (!ownedPrefixes.some((prefix) => key.startsWith(prefix))) {
    throw new StorageOwnershipError("Image path is not owned by the authenticated user");
  }

  return key;
}

export function normalizeStorageKey(value: string): string {
  let raw = value.trim();
  if (!raw) {
    throw new StorageOwnershipError("Missing storage key", 400);
  }

  const clickatronPublicBaseUrl = stripTrailingSlash(
    process.env.R2_PUBLIC_BASE_URL_CLICKATRON || process.env.R2_PUBLIC_BASE_URL_clickatron,
  );
  const clickatronWorkerUrl = stripTrailingSlash(process.env.CLICKATRON_R2_WORKER_URL);
  const genericPublicBaseUrl = stripTrailingSlash(process.env.R2_PUBLIC_BASE_URL);

  for (const prefix of [clickatronPublicBaseUrl, genericPublicBaseUrl].filter(Boolean) as string[]) {
    if (raw.startsWith(`${prefix}/`)) {
      raw = raw.slice(prefix.length + 1);
      break;
    }
  }

  if (clickatronWorkerUrl && raw.startsWith(`${clickatronWorkerUrl}/clickatron/`)) {
    raw = raw.slice(`${clickatronWorkerUrl}/clickatron/`.length);
  }

  if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new StorageOwnershipError("Malformed storage URL", 400);
    }

    raw = url.pathname.replace(/^\/+/, "");

    const bucketNames = [
      process.env.R2_BUCKET_NAME,
      process.env.R2_BUCKET_NAME_CLICKATRON,
      process.env.R2_BUCKET_NAME_clickatron,
      process.env.GCS_BUCKET_NAME,
    ].filter(Boolean) as string[];

    for (const bucketName of bucketNames) {
      if (raw.startsWith(`${bucketName}/`)) {
        raw = raw.slice(bucketName.length + 1);
        break;
      }
    }
  }

  if (raw.startsWith("clickatron/")) {
    raw = raw.slice("clickatron/".length);
  }

  return decodeStorageKey(raw.split("?")[0].split("#")[0]);
}
