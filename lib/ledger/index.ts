/**
 * Source Ledger — public entry point (Master v1.1 §5.5).
 *
 * The shared "analyze once, store by referenceId, many consumers" module. Import ledger
 * contracts from here (`@/lib/ledger`). The canonical per-exemplar reference format lives
 * at `@/lib/editron/types/edit-fingerprint` and is referenced by LedgerExtracts.editFingerprint.
 *
 * Phase 1 = type contracts only. Storage (Mongo/R2), analyzer dispatch, two-check dedupe,
 * and zod validation land in later phases and will be re-exported here.
 */

export * from './types';
