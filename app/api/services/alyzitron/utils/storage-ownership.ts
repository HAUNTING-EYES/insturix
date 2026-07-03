export class AlyzitronStorageOwnershipError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AlyzitronStorageOwnershipError";
    this.status = status;
  }
}

export function getAlyzitronUserStoragePrefix(userId: string): string {
  const normalizedUserId = userId.replace(/^user_/, "");
  return `user_${normalizedUserId}/alyzitron-uploads/`;
}

export function normalizeAlyzitronStorageKey(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const rawValue = value.trim();
  if (!rawValue) return null;

  if (!rawValue.startsWith("http")) {
    return rawValue.replace(/^\/+/, "");
  }

  try {
    const url = new URL(rawValue);
    let pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");

    if (pathname.startsWith("asset/")) {
      pathname = pathname.slice("asset/".length);
    }

    const bucketName = process.env.ALYZITRON_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || "editron-cdn";
    if (pathname.startsWith(`${bucketName}/`)) {
      pathname = pathname.slice(bucketName.length + 1);
    }

    return pathname;
  } catch {
    return null;
  }
}

export function requireAlyzitronOwnedStorageKey(userId: string, value: unknown): string {
  const key = normalizeAlyzitronStorageKey(value);
  if (!key || key.includes("\\") || key.split("/").includes("..")) {
    throw new AlyzitronStorageOwnershipError("Invalid storage key", 400);
  }

  const prefix = getAlyzitronUserStoragePrefix(userId);
  if (!key.startsWith(prefix)) {
    throw new AlyzitronStorageOwnershipError("Storage key is not owned by this user", 403);
  }

  return key;
}

export function buildAlyzitronPublicUrl(storageKey: string, storage: "gcs" | "r2"): string {
  if (storage === "gcs") {
    const bucketName = process.env.GCS_BUCKET_NAME;
    return bucketName ? `https://storage.googleapis.com/${bucketName}/${storageKey}` : "";
  }

  const bucketName = process.env.ALYZITRON_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || "editron-cdn";
  const accountId = process.env.R2_ACCOUNT_ID;
  const cdnWorkerUrl = process.env.CDN_WORKER_URL?.replace(/\/+$/, "");

  if (cdnWorkerUrl) {
    return `${cdnWorkerUrl}/asset/${storageKey}`;
  }

  return accountId ? `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${storageKey}` : "";
}

export function sanitizeAlyzitronFilename(filename: unknown): string {
  const rawFilename = typeof filename === "string" ? filename : "upload";
  const cleanFilename = rawFilename.replace(/[^a-zA-Z0-9-_.]/g, "_").slice(0, 180);
  return cleanFilename || "upload";
}
