/**
 * The cross-service-safe subset of a document's authoring snapshot. Retrieval
 * IDs and all raw authoring material deliberately remain in ThinkForge.
 *
 * This module is intentionally browser-safe. ThinkForge handoff previews use
 * it without importing Brand Vault's MongoDB-backed authority resolver.
 */
export type ThinkForgeAuthoringProvenance = {
  version?: number;
  resolvedAt?: string;
  brand?: {
    brandId: string;
    recordId?: string;
    profileUpdatedAt?: string;
    profileFingerprint?: string;
  };
  writingKnowledgeVersion?: string | null;
};

export class ThinkForgeAuthoringProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThinkForgeAuthoringProvenanceError';
  }
}

function toPlainRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function projectThinkForgeAuthoringProvenance(input: {
  snapshot?: unknown;
  expectedBrandId?: string;
}): ThinkForgeAuthoringProvenance | undefined {
  const snapshot = toPlainRecord(input.snapshot);
  if (!snapshot) return undefined;

  const brandRecord = toPlainRecord(snapshot.brand);
  const snapshotBrandId = toNonEmptyString(brandRecord?.brandId);
  const expectedBrandId = toNonEmptyString(input.expectedBrandId);
  if (expectedBrandId && snapshotBrandId && snapshotBrandId !== expectedBrandId) {
    throw new ThinkForgeAuthoringProvenanceError(
      "ThinkForge document provenance does not match the session's bound brand.",
    );
  }

  const recordId = toNonEmptyString(brandRecord?.recordId);
  const profileUpdatedAt = toNonEmptyString(brandRecord?.profileUpdatedAt);
  const profileFingerprint = toNonEmptyString(brandRecord?.profileFingerprint);
  const brand = snapshotBrandId
    ? {
        brandId: snapshotBrandId,
        ...(recordId ? { recordId } : {}),
        ...(profileUpdatedAt ? { profileUpdatedAt } : {}),
        ...(profileFingerprint ? { profileFingerprint } : {}),
      }
    : undefined;
  const version = typeof snapshot.version === 'number' && Number.isInteger(snapshot.version)
    ? snapshot.version
    : undefined;
  const resolvedAt = toNonEmptyString(snapshot.resolvedAt);
  const writingKnowledgeVersion = typeof snapshot.writingKnowledgeVersion === 'string'
    ? snapshot.writingKnowledgeVersion.trim() || null
    : snapshot.writingKnowledgeVersion === null
      ? null
      : undefined;
  const provenance = {
    ...(version !== undefined ? { version } : {}),
    ...(resolvedAt ? { resolvedAt } : {}),
    ...(brand ? { brand } : {}),
    ...(writingKnowledgeVersion !== undefined ? { writingKnowledgeVersion } : {}),
  };
  return Object.keys(provenance).length > 0 ? provenance : undefined;
}
