/**
 * Source Ledger — core type contracts (Master v1.1 §5.5, §5.6.5).
 *
 * The Ledger is the shared "what you've looked at" store: every ingested artifact
 * (an Insturix Trends exemplar, a pasted reference link, a user upload, a PDF) is
 * analyzed ONCE and stored under a `referenceId`. ThinkForge / Editron / Clickatron
 * inherit those extracts via project-links.metadata.referenceIds — analyze once,
 * many consumers (§5.5.4).
 *
 * BOUNDARY (§1.3): reference material NEVER writes to the Brand Vault. The Ledger is
 * "what you've looked at"; the Vault is "who you are". Vault writes happen only by
 * explicit user promotion at export — never from here.
 *
 * SCOPE (product context — agencies run MANY brands): access is scoped by user/org,
 * NOT by brand. A reference you analyzed is brand-agnostic; brand identity lives in
 * the Vault, not the Ledger.
 *
 * This file is a PURE TYPE CONTRACT — no logic, no thresholds. Dedupe normalization,
 * zod validation, analyzer dispatch, and Mongo/R2 storage land in later phases behind
 * these types.
 */

import type { EditFingerprint } from '@/lib/editron/types/edit-fingerprint';

/** A Source Ledger reference key. Every analyzed artifact is stored under one of these. */
export type ReferenceId = string;

/** What kind of source an artifact is. */
export type LedgerSourceKind =
  | 'platform-video' // IG reel / YT short fetched by a tracker
  | 'user-video' // user-uploaded mp4/mov
  | 'link' // a pasted URL (page or video)
  | 'doc' // PDF / document analyzed via Gemini native
  | 'image'
  | 'audio';

/** The platform an artifact came from (drives normalized-URL/ID dedupe, §5.6.5). */
export type LedgerPlatform = 'instagram' | 'youtube' | 'tiktok' | 'web' | 'upload';

/**
 * Access scope. Ledger = "what you've looked at" → scoped to user/org, NEVER brand
 * (that is the Vault). `orgId` carries the agency workspace so multi-brand teams share
 * a reference pool without leaking it into any one brand.
 */
export interface LedgerOwner {
  userId: string;
  orgId?: string;
}

/**
 * Identity used for the TWO-CHECK dedupe (§5.6.5):
 *   (a) normalized platform URL/ID at ingest — covers the whole curated trend pipeline;
 *   (b) a chromaprint (fpcalc) fingerprint — user-uploaded FILES only.
 * No pHash / perceptual video matching; a trimmed re-upload costing one redundant analysis is accepted.
 */
export interface LedgerDedupeIdentity {
  /** Normalized platform URL or stable platform id. */
  normalizedUrl?: string;
  platform?: LedgerPlatform;
  platformId?: string;
  /** fpcalc/chromaprint fingerprint — user-uploaded files only. */
  chromaprint?: string;
}

/**
 * A fact extracted from a source, carrying provenance so a script can only claim what it
 * can cite (§5.1.5: "a fact TF can't cite is a fact the script can't claim").
 */
export interface FactWithProvenance {
  claim: string;
  /** The source this fact came from. */
  sourceRefId: ReferenceId;
  /** timestamp ms (video) / page (doc) / selector (page) that grounds the claim. */
  locator?: string;
  /** true when the fact is pre-licensed for use in stat graphics (§5.5.3). */
  licensedForGraphics?: boolean;
}

/** A copy-this / NOT-this annotation captured from a reference (§5.5.3). */
export interface CopyAnnotation {
  kind: 'copy-this' | 'not-this';
  note: string;
  /** locator into the source (ms / region / selector). */
  locator?: string;
}

/** Visual style params lifted from reference MEDIA. Intentionally light in the contract; the extractor fills richer params. */
export interface ReferenceMediaStyle {
  dominantColors?: string[];
  [key: string]: unknown;
}

/** A licensed data point usable for stat graphics. */
export interface LedgerDataPoint {
  label: string;
  value: number | string;
  sourceRefId: ReferenceId;
}

/** The typed extracts stored for one analyzed artifact (§5.5.3). Every field optional — an artifact yields only what it has. */
export interface LedgerExtracts {
  /** Coarse scene-by-scene skeleton (supersedes the old ReferenceScene[]). */
  structureSkeleton?: unknown;
  /** The canonical per-exemplar EditFingerprint (§7.2), when the artifact is a video/exemplar. */
  editFingerprint?: EditFingerprint;
  factsWithProvenance?: FactWithProvenance[];
  copyAnnotations?: CopyAnnotation[];
  referenceMediaStyle?: ReferenceMediaStyle;
  dataPoints?: LedgerDataPoint[];
  /** Ledger refs of voice samples extracted from the source (for casting `voiceSampleRef`). */
  voiceSampleRefs?: ReferenceId[];
}

/** One analyzed artifact, stored under its referenceId. Analyze once, many consumers (§5.5). */
export interface LedgerEntry {
  referenceId: ReferenceId;
  owner: LedgerOwner;
  sourceKind: LedgerSourceKind;
  sourceUrl?: string;
  dedupe: LedgerDedupeIdentity;
  /** Which analyzer(s) ran + their model ids, for reproducibility (e.g. 'glm-4.6v', 'gemini-2.5-flash'). */
  analyzers?: string[];
  extracts: LedgerExtracts;
  /** ISO timestamp of analysis. */
  analyzedAt: string;
  schemaVersion: number;
}
