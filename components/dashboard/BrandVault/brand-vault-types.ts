/**
 * Brand Vault - UI types
 *
 * Re-exports the canonical contract types from lib/shared (single source of
 * truth - never redefine the signal contract here) and adds the small set of
 * view-model types the Brand Vault review UI needs.
 */

import type {
  BrandSignal,
  BrandSignalAuthorityClass,
  BrandSignalEvidence,
  BrandSignalProfile,
  BrandSignalTrustLevel,
} from '@/lib/shared/brand-signal-profile';
import type { BrandSignalProfileRecord } from '@/lib/shared/brand-signal-lifecycle';
import type {
  BrandEvidenceCandidate,
  BrandRefineryJob,
  BrandVaultSourceInput,
} from '@/lib/shared/brand-website-refinery-types';
import type {
  BrandVaultFontPreview,
  BrandVaultSignalGroup,
  BrandVaultSignalGroupCoverage,
  BrandVaultVisualAssetPreview,
  BrandVaultVisualIdentitySummary,
  BrandVaultVisualSwatch,
  BrandVaultWebsiteDraftReviewPayload,
} from '@/lib/shared/brand-vault-draft-orchestrator';
import type { BrandVaultAcceptedBrandSummary } from '@/lib/shared/brand-vault-refinery-api';

export type {
  BrandSignal,
  BrandSignalAuthorityClass,
  BrandSignalEvidence,
  BrandSignalProfile,
  BrandSignalTrustLevel,
  BrandSignalProfileRecord,
  BrandEvidenceCandidate,
  BrandRefineryJob,
  BrandVaultSourceInput,
  BrandVaultFontPreview,
  BrandVaultSignalGroup,
  BrandVaultSignalGroupCoverage,
  BrandVaultVisualAssetPreview,
  BrandVaultVisualIdentitySummary,
  BrandVaultVisualSwatch,
  BrandVaultWebsiteDraftReviewPayload,
  BrandVaultAcceptedBrandSummary,
};

/* ------------------------------------------------------------------ */
/*  API envelope (the four /api/brand-vault routes)                    */
/* ------------------------------------------------------------------ */

export interface BrandVaultApiError {
  ok: false;
  error?: { code?: string; message?: string };
}

/** Shape shared by job create/reload, profile load, and review responses. */
export interface BrandVaultApiSuccess {
  ok: true;
  job?: BrandRefineryJob | null;
  record?: BrandSignalProfileRecord | null;
  reviewPayload?: BrandVaultWebsiteDraftReviewPayload | null;
  candidates?: BrandEvidenceCandidate[];
  superseded?: BrandSignalProfileRecord[];
}

export type BrandVaultApiResult = BrandVaultApiSuccess | BrandVaultApiError;

export interface BrandVaultAcceptedBrandsApiSuccess {
  ok: true;
  brands: BrandVaultAcceptedBrandSummary[];
}

export type BrandVaultAcceptedBrandsApiResult = BrandVaultAcceptedBrandsApiSuccess | BrandVaultApiError;

/**
 * One bounded scan summary for the brand manager / rescan history UI.
 * Mirrors the server contract in app/api/brand-vault/brands/[brandId]/scans/route.ts
 * (kept in sync by hand — a client component cannot import a route without pulling
 * server-only code into the bundle). No raw candidates or evidence payloads.
 */
export interface BrandVaultBrandScanSummary {
  jobId: string;
  brandId: string | null;
  orgId: string | null;
  userId: string;
  recordId: string | null;
  status: 'queued' | 'running' | 'needs_review' | 'accepted' | 'rejected' | 'failed';
  websiteUrl: string | null;
  companyName: string | null;
  socialLinks: string[];
  normalizedUrl: string | null;
  candidateCount: number;
  warningCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrandVaultBrandScansApiSuccess {
  ok: true;
  brandId: string;
  scans: BrandVaultBrandScanSummary[];
}

export type BrandVaultBrandScansApiResult = BrandVaultBrandScansApiSuccess | BrandVaultApiError;

/** Normalized snapshot the UI renders from, regardless of which route filled it. */
export interface BrandVaultSnapshot {
  job: BrandRefineryJob | null;
  record: BrandSignalProfileRecord | null;
  reviewPayload: BrandVaultWebsiteDraftReviewPayload | null;
  candidates: BrandEvidenceCandidate[];
}

export interface CreateBrandVaultDraftInput {
  /** Existing client target. Omit only with newClient so the server can mint the first stable id. */
  brandId?: string;
  /** Explicit first-scan intent; never paired with a client-supplied brandId. */
  newClient?: boolean;
  websiteUrl: string;
  companyName?: string;
  socialLinks?: string[];
  sourceEvidence?: BrandVaultSourceInput[];
}

/* ------------------------------------------------------------------ */
/*  View models                                                        */
/* ------------------------------------------------------------------ */

/** Signal facets + a synthetic "warnings" lane for fallback/low-confidence. */
export type SignalGroupId = BrandVaultSignalGroup | 'warnings';

export interface SignalGroupMeta {
  id: SignalGroupId;
  label: string;
  color: string;
}

export type SignalTone = 'good' | 'warn' | 'risk' | 'neutral';

/** A flattened, evidence-backed signal ready for the review table. */
export interface SignalRow {
  path: string;
  group: SignalGroupId;
  label: string;
  value: unknown;
  confidence: number;
  trustLevel: string;
  authorityClass: string;
  evidenceIds: string[];
  fallbackReason?: string;
}

export type SourceLaneStatus = 'live' | 'pending' | 'not_provided' | 'failed';

/** A provenance lane (website / socials / uploads / crawler / legacy). */
export interface SourceLane {
  id: string;
  label: string;
  detail: string;
  status: SourceLaneStatus;
  count: number;
  /** Tabler icon name, e.g. "world". */
  icon: string;
}

/** A coverage facet for the brand-first hero's compact coverage map (one per signal group). */
export interface BrandConstellationFacet {
  id: string;
  label: string;
  color: string;
  /** 0..1 coverage/confidence; drives the facet star magnitude. */
  coverage: number;
}

/** Two or more candidates disagree for the same signal path. */
export interface SignalConflict {
  path: string;
  label: string;
  group: SignalGroupId;
  candidates: BrandEvidenceCandidate[];
}

export type EvidenceItem = BrandSignalEvidence | BrandEvidenceCandidate;
