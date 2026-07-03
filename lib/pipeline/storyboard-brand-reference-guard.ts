import { cleanOptionalString, requiresBrandReferenceEvidence } from './reference-brand-evidence';
import { getReferenceImageSet } from './reference-image-db';
import type { Storyboard } from './schemas/storyboard';

const VERIFIED_REFERENCE_PROVENANCES = new Set(['brand-vault', 'website-screenshot', 'uploaded']);
const BLOCKED_REFERENCE_PROVENANCES = new Set(['generated', 'missing-brand-evidence']);
const VERIFIED_REFERENCE_SOURCES = new Set(['brand-vault-product-image', 'website-screenshot', 'user-upload']);

export type BrandReferenceSubjectIssue = {
  subjectId?: string;
  name: string;
  category?: string;
  status?: string;
  source?: string;
  referenceProvenance?: string;
  reason: string;
};

export type StoryboardBrandReferenceIssue = {
  reason: 'brand-reference-evidence-required';
  message: string;
  brandId: string;
  refSetId?: string;
  subjects: BrandReferenceSubjectIssue[];
  allowedProvenance: string[];
};

type ReferenceCandidate = {
  subjectId?: unknown;
  name?: unknown;
  category?: unknown;
  visualDescription?: unknown;
  imageUrl?: unknown;
  imageAssetId?: unknown;
  imageGcsPath?: unknown;
  source?: unknown;
  referenceProvenance?: unknown;
  requiresBrandEvidence?: unknown;
  brandEvidenceStatus?: unknown;
  status?: unknown;
};

function hasReferenceImageEvidence(subject: ReferenceCandidate): boolean {
  return Boolean(
    cleanOptionalString(subject.imageUrl) ||
    cleanOptionalString(subject.imageAssetId) ||
    cleanOptionalString(subject.imageGcsPath),
  );
}

function hasVerifiedBrandReferenceEvidence(subject: ReferenceCandidate): boolean {
  if (!hasReferenceImageEvidence(subject)) return false;

  const provenance = cleanOptionalString(subject.referenceProvenance);
  if (provenance && VERIFIED_REFERENCE_PROVENANCES.has(provenance)) return true;

  const source = cleanOptionalString(subject.source);
  return Boolean(source && VERIFIED_REFERENCE_SOURCES.has(source));
}

function normalizeReferenceKey(value: unknown): string | undefined {
  const text = cleanOptionalString(value);
  if (!text) return undefined;
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function activeReferenceSubject(subject: ReferenceCandidate): boolean {
  return cleanOptionalString(subject.status) !== 'rejected';
}

function referencedByStoryboard(
  subject: ReferenceCandidate,
  approvedReferences: ReferenceCandidate[],
): boolean {
  if (approvedReferences.length === 0) return true;

  const approvedIds = new Set(
    approvedReferences
      .map((ref) => cleanOptionalString(ref.subjectId))
      .filter((subjectId): subjectId is string => Boolean(subjectId)),
  );
  const subjectId = cleanOptionalString(subject.subjectId);
  if (subjectId && approvedIds.has(subjectId)) return true;

  const approvedNames = new Set(
    approvedReferences
      .map((ref) => normalizeReferenceKey(ref.name))
      .filter((name): name is string => Boolean(name)),
  );
  const subjectName = normalizeReferenceKey(subject.name);
  return Boolean(subjectName && approvedNames.has(subjectName));
}

function requiresEvidenceForBrandSubject(subject: ReferenceCandidate, brandId: string): boolean {
  if (subject.requiresBrandEvidence === true) return true;
  if (cleanOptionalString(subject.brandEvidenceStatus) === 'missing') return true;

  return requiresBrandReferenceEvidence(
    {
      name: cleanOptionalString(subject.name),
      category: cleanOptionalString(subject.category),
      visualDescription: cleanOptionalString(subject.visualDescription),
    },
    { brandId, subjectHints: [] },
  );
}

function buildSubjectIssue(subject: ReferenceCandidate): BrandReferenceSubjectIssue {
  const provenance = cleanOptionalString(subject.referenceProvenance);
  const hasImage = hasReferenceImageEvidence(subject);
  return {
    subjectId: cleanOptionalString(subject.subjectId),
    name: cleanOptionalString(subject.name) ?? 'Unnamed reference',
    category: cleanOptionalString(subject.category),
    status: cleanOptionalString(subject.status),
    source: cleanOptionalString(subject.source),
    referenceProvenance: provenance,
    reason: !hasImage
      ? 'reference-image-missing'
      : provenance && BLOCKED_REFERENCE_PROVENANCES.has(provenance)
        ? 'reference-provenance-blocked'
        : provenance
          ? 'reference-provenance-unverified'
          : 'reference-provenance-missing',
  };
}

export async function resolveStoryboardBrandReferenceIssue(params: {
  storyboard: Storyboard;
  userId: string;
  brandId?: unknown;
}): Promise<StoryboardBrandReferenceIssue | null> {
  const { storyboard, userId } = params;
  const refSetId = cleanOptionalString(storyboard.refSetId);
  const approvedReferences = Array.isArray(storyboard.approvedReferences)
    ? (storyboard.approvedReferences as ReferenceCandidate[])
    : [];

  let refSetBrandId: string | undefined;
  let refSetSubjects: ReferenceCandidate[] = [];
  if (refSetId) {
    const refSet = await getReferenceImageSet(refSetId, userId);
    refSetBrandId = cleanOptionalString((refSet as any)?.brandId);
    refSetSubjects = Array.isArray(refSet?.subjects) ? (refSet.subjects as ReferenceCandidate[]) : [];
  }

  const brandId =
    cleanOptionalString(params.brandId) ||
    cleanOptionalString((storyboard as any).brandId) ||
    refSetBrandId;
  if (!brandId) return null;

  const candidates = refSetSubjects.length > 0 ? refSetSubjects : approvedReferences;
  const subjects = candidates
    .filter(activeReferenceSubject)
    .filter((subject) => referencedByStoryboard(subject, approvedReferences))
    .filter((subject) => requiresEvidenceForBrandSubject(subject, brandId))
    .filter((subject) => !hasVerifiedBrandReferenceEvidence(subject))
    .map(buildSubjectIssue);

  if (subjects.length === 0) return null;

  return {
    reason: 'brand-reference-evidence-required',
    message: 'Brand-owned references require verified Brand Vault, website screenshot, or uploaded evidence before paid production steps.',
    brandId,
    refSetId,
    subjects,
    allowedProvenance: [...VERIFIED_REFERENCE_PROVENANCES],
  };
}