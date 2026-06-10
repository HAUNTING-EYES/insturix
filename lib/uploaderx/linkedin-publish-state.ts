export type LinkedInPublishTarget = "personal" | "organization";

export interface ExistingLinkedInPublishedPost {
  target: LinkedInPublishTarget;
  postId: string;
  postUrl: string;
  assetUrn?: string;
  mediaType?: string;
  organizationId: string | null;
}

export function normalizeLinkedInPostTarget(postType: unknown): LinkedInPublishTarget {
  return postType === "organization" ? "organization" : "personal";
}

export function linkedinOrganizationMetadataKey(organizationId: unknown): string | null {
  const raw = nullableString(organizationId);
  return raw ? raw.replace(/[.$]/g, "_") : null;
}

export function getExistingLinkedInPublishedPost(
  metadata: unknown,
  postType: unknown,
  organizationId?: unknown,
): ExistingLinkedInPublishedPost | null {
  const target = normalizeLinkedInPostTarget(postType);
  const linkedin = objectRecord(metadata)?.linkedin;
  const linkedinMetadata = objectRecord(linkedin);
  if (!linkedinMetadata) {
    return null;
  }

  const targetMetadata =
    target === "organization"
      ? getOrganizationMetadata(linkedinMetadata, organizationId)
      : objectRecord(linkedinMetadata.personal);

  if (!targetMetadata) {
    return null;
  }

  const postId = nonEmptyString(targetMetadata.postId);
  if (!postId) {
    return null;
  }

  const postUrl = nonEmptyString(targetMetadata.postUrl) || `https://www.linkedin.com/feed/update/${postId}`;
  return {
    target,
    postId,
    postUrl,
    assetUrn: nonEmptyString(targetMetadata.assetUrn) || undefined,
    mediaType: nonEmptyString(targetMetadata.mediaType) || undefined,
    organizationId: target === "organization" ? nullableString(targetMetadata.organizationId) : null,
  };
}

function getOrganizationMetadata(
  linkedinMetadata: Record<string, unknown>,
  organizationId: unknown,
): Record<string, unknown> | null {
  const requestedOrganizationId = nullableString(organizationId);
  const organizationKey = linkedinOrganizationMetadataKey(organizationId);
  const organizations = objectRecord(linkedinMetadata.organizations);
  const mappedOrganization = organizationKey ? objectRecord(organizations?.[organizationKey]) : null;
  if (mappedOrganization) {
    return {
      ...mappedOrganization,
      organizationId: mappedOrganization.organizationId ?? requestedOrganizationId,
    };
  }

  const legacyOrganization = objectRecord(linkedinMetadata.organization);
  if (!legacyOrganization) {
    return null;
  }

  const legacyOrganizationId = nullableString(legacyOrganization.organizationId);
  if (legacyOrganizationId !== requestedOrganizationId) {
    return null;
  }

  return legacyOrganization;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return nonEmptyString(value);
}
