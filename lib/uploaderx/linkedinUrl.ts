import { NextRequest } from "next/server";

function ensureAbsoluteUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return null;
}

export function getLinkedInAppOrigin(request?: Request | NextRequest) {
  const explicit = ensureAbsoluteUrl(process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL || "");
  if (explicit) {
    return new URL(explicit).origin;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}`;
  }

  if (request?.url) {
    return new URL(request.url).origin;
  }

  return "http://localhost:3000";
}

export function getLinkedInRedirectUri(request?: Request | NextRequest) {
  const explicitRedirect = ensureAbsoluteUrl(process.env.LINKEDIN_REDIRECT_URI || "");
  if (explicitRedirect) {
    return explicitRedirect;
  }

  return new URL("/api/services/uploaderx/linkedin/callback", getLinkedInAppOrigin(request)).toString();
}

export function getLinkedInDashboardUrl(
  pathAndQuery = "/dashboard/uploaderx",
  request?: Request | NextRequest
) {
  return new URL(pathAndQuery, getLinkedInAppOrigin(request)).toString();
}
