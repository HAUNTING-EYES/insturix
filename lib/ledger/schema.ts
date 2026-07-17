/**
 * Source Ledger — envelope validation (Master v1.1 §5.5, fail-loud gate).
 *
 * Validates a LedgerEntry at the persistence boundary: the envelope (referenceId, owner,
 * sourceKind, dedupe identity, timestamps) and the provenance-bearing extracts (facts,
 * copy annotations, data points) are validated STRICTLY, because the "a fact you can't
 * cite is a fact you can't claim" law (§5.1.5) depends on them.
 *
 * SCOPE (non-premature, by design): `editFingerprint` and `structureSkeleton` are accepted
 * as opaque here. Nothing PRODUCES an EditFingerprint yet (the extractor is a later phase),
 * so a full 10-layer zod mirror would be premature and drift from the type. The dedicated
 * fingerprint schema + the §7.3 round-trip gate land WITH the extractor.
 *
 * Mirrors the zod v4 patterns already used in lib/thinkforge/schemas/trend-spec.ts.
 */

import { z } from 'zod';
import type { LedgerEntry } from './types';

export const LEDGER_SCHEMA_VERSION = 1 as const;

export const LedgerPlatformSchema = z.enum(['instagram', 'youtube', 'tiktok', 'web', 'upload']);

export const LedgerSourceKindSchema = z.enum([
  'platform-video',
  'user-video',
  'link',
  'doc',
  'image',
  'audio',
]);

export const LedgerOwnerSchema = z.object({
  userId: z.string().min(1),
  orgId: z.string().min(1).optional(),
});

export const LedgerDedupeIdentitySchema = z
  .object({
    normalizedUrl: z.string().min(1).optional(),
    platform: LedgerPlatformSchema.optional(),
    platformId: z.string().min(1).optional(),
    chromaprint: z.string().min(1).optional(),
  })
  .superRefine((identity, ctx) => {
    // An entry with no dedupe identity is un-findable — reject it loudly.
    if (!identity.normalizedUrl && !identity.platformId && !identity.chromaprint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dedupe identity must carry at least one of normalizedUrl / platformId / chromaprint',
      });
    }
    // A platformId with no platform can't form its dedupe key — require the pair.
    if (identity.platformId && !identity.platform) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['platform'],
        message: 'platform is required when platformId is set',
      });
    }
  });

export const FactWithProvenanceSchema = z.object({
  claim: z.string().min(1),
  sourceRefId: z.string().min(1),
  locator: z.string().optional(),
  licensedForGraphics: z.boolean().optional(),
});

export const CopyAnnotationSchema = z.object({
  kind: z.enum(['copy-this', 'not-this']),
  note: z.string().min(1),
  locator: z.string().optional(),
});

export const LedgerDataPointSchema = z.object({
  label: z.string().min(1),
  value: z.union([z.number(), z.string()]),
  sourceRefId: z.string().min(1),
});

export const ReferenceMediaStyleSchema = z
  .object({ dominantColors: z.array(z.string()).optional() })
  .passthrough();

export const LedgerExtractsSchema = z
  .object({
    // Opaque until the extractor phase ships their dedicated schemas (see file header).
    structureSkeleton: z.unknown().optional(),
    editFingerprint: z.unknown().optional(),
    factsWithProvenance: z.array(FactWithProvenanceSchema).optional(),
    copyAnnotations: z.array(CopyAnnotationSchema).optional(),
    referenceMediaStyle: ReferenceMediaStyleSchema.optional(),
    dataPoints: z.array(LedgerDataPointSchema).optional(),
    voiceSampleRefs: z.array(z.string().min(1)).optional(),
  })
  .passthrough();

export const LedgerEntrySchema = z
  .object({
    referenceId: z.string().min(1),
    owner: LedgerOwnerSchema,
    sourceKind: LedgerSourceKindSchema,
    sourceUrl: z.string().optional(),
    dedupe: LedgerDedupeIdentitySchema,
    analyzers: z.array(z.string().min(1)).optional(),
    extracts: LedgerExtractsSchema,
    analyzedAt: z.string().min(1),
    schemaVersion: z.number().int().positive(),
  })
  .passthrough();

/**
 * Parse + validate an untrusted value into a LedgerEntry. Throws ZodError on any violation.
 * The cast bridges the intentionally-opaque `editFingerprint`/`structureSkeleton` (unknown
 * in the schema) to the typed LedgerEntry — the two are structurally compatible.
 */
export function parseLedgerEntry(input: unknown): LedgerEntry {
  return LedgerEntrySchema.parse(input) as LedgerEntry;
}
