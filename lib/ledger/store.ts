/**
 * Source Ledger — persistence (Master v1.1 §5.5).
 *
 * Stores an analyzed artifact under its `referenceId` and answers "have we analyzed this
 * before?" via the two-check dedupe (§5.6.5). Mirrors the repository conventions in
 * lib/shared/project-links.ts (module-local collection constant, getCollection() over
 * getDatabase(), every query scoped to the owner).
 *
 * SCOPE (product context — agencies run MANY brands): reads/dedupe are scoped by ORG when
 * an orgId is present (the agency shares one reference pool), else by user. NEVER by brand
 * (§1.3: the Ledger is "what you've looked at", the Vault is "who you are").
 *
 * Media is NOT stored here. The Ledger persists the ANALYSIS; the raw media already lives
 * in storage at ingest and is carried as a reference (sourceUrl / asset refs), not re-uploaded.
 *
 * The store validates every write with parseLedgerEntry (fail-loud) and persists a derived
 * `dedupeKeys` array (indexed) so findByDedupe is a single indexed query.
 */

import type { Filter } from 'mongodb';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import type { LedgerEntry, LedgerOwner, LedgerDedupeIdentity } from './types';
import { parseLedgerEntry } from './schema';
import { dedupeKeys } from './dedupe';

export const LEDGER_COLLECTION = COLLECTIONS.LEDGER;

/** Persisted shape: the entry plus its derived, indexed dedupe keys. `dedupeKeys` is a storage detail. */
interface PersistedLedgerEntry extends LedgerEntry {
  dedupeKeys: string[];
}

/** Internal fields projected out of every read so callers get a clean LedgerEntry. */
const CLEAN_PROJECTION = { _id: 0, dedupeKeys: 0 } as const;

async function getCollection() {
  const db = await getDatabase();
  return db.collection<PersistedLedgerEntry>(LEDGER_COLLECTION);
}

/** Scope every query to the owner: org-shared when orgId is set, else the individual user. */
function ownerFilter(owner: LedgerOwner): Filter<PersistedLedgerEntry> {
  return (owner.orgId ? { 'owner.orgId': owner.orgId } : { 'owner.userId': owner.userId }) as Filter<PersistedLedgerEntry>;
}

/**
 * Validate + upsert a Ledger entry by referenceId (idempotent — a re-analysis under the same
 * referenceId replaces the prior entry). Throws ZodError on an invalid entry.
 */
export async function putEntry(entry: LedgerEntry): Promise<LedgerEntry> {
  const validated = parseLedgerEntry(entry);
  const persisted: PersistedLedgerEntry = { ...validated, dedupeKeys: dedupeKeys(validated.dedupe) };
  const col = await getCollection();
  await col.replaceOne({ referenceId: validated.referenceId }, persisted, { upsert: true });
  return validated;
}

/** Read one entry by referenceId, scoped to the owner. */
export async function getByReferenceId(
  referenceId: string,
  owner: LedgerOwner,
): Promise<LedgerEntry | null> {
  const col = await getCollection();
  const filter = { referenceId, ...ownerFilter(owner) } as Filter<PersistedLedgerEntry>;
  const doc = await col.findOne(filter, { projection: CLEAN_PROJECTION });
  return (doc as LedgerEntry | null) ?? null;
}

/**
 * "Have we analyzed this before?" — matches an existing entry sharing ANY dedupe key with the
 * given identity, scoped to the owner. Returns null when the identity carries nothing to
 * dedupe on (a genuinely new artifact).
 */
export async function findByDedupe(
  identity: LedgerDedupeIdentity,
  owner: LedgerOwner,
): Promise<LedgerEntry | null> {
  const keys = dedupeKeys(identity);
  if (keys.length === 0) return null;
  const col = await getCollection();
  const filter = { ...ownerFilter(owner), dedupeKeys: { $in: keys } } as Filter<PersistedLedgerEntry>;
  const doc = await col.findOne(filter, { projection: CLEAN_PROJECTION });
  return (doc as LedgerEntry | null) ?? null;
}
