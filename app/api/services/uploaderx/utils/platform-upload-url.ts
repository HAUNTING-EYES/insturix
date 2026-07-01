export type UploaderXUploadProvider = "facebook" | "linkedin";

export class UploaderXUploadUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploaderXUploadUrlError";
  }
}

const ALLOWED_UPLOAD_HOSTS: Record<UploaderXUploadProvider, Set<string>> = {
  facebook: new Set(["rupload.facebook.com", "graph-video.facebook.com"]),
  linkedin: new Set(["api.linkedin.com", "www.linkedin.com", "upload.linkedin.com", "uploads.linkedin.com"]),
};

export interface LinkedInUploadInstruction {
  uploadUrl: string;
  firstByte: number;
  lastByte: number;
}

export function requireAllowedUploaderXUploadUrl(value: unknown, provider: UploaderXUploadProvider): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new UploaderXUploadUrlError("Missing upload URL");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UploaderXUploadUrlError("Malformed upload URL");
  }

  if (url.protocol !== "https:") {
    throw new UploaderXUploadUrlError("Upload URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new UploaderXUploadUrlError("Upload URL must not contain credentials");
  }
  if (url.port) {
    throw new UploaderXUploadUrlError("Upload URL must not contain a custom port");
  }

  const host = url.hostname.toLowerCase();
  if (!ALLOWED_UPLOAD_HOSTS[provider].has(host)) {
    throw new UploaderXUploadUrlError("Upload URL host is not allowed for this provider");
  }

  return url.toString();
}

export function normalizeLinkedInUploadInstruction(instruction: unknown): LinkedInUploadInstruction {
  const raw = instruction as Record<string, unknown>;
  const uploadUrl = requireAllowedUploaderXUploadUrl(raw?.uploadUrl, "linkedin");
  const firstByte = Number(raw?.firstByte ?? raw?.first_byte);
  const lastByte = Number(raw?.lastByte ?? raw?.last_byte);

  if (!Number.isSafeInteger(firstByte) || !Number.isSafeInteger(lastByte) || firstByte < 0 || lastByte < firstByte) {
    throw new UploaderXUploadUrlError("Invalid LinkedIn upload byte range");
  }

  return { uploadUrl, firstByte, lastByte };
}
