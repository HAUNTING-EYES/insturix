import type { Filter } from 'mongodb';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  assertSourceMediaRightsGrantStateV1,
  type SourceMediaRightsGrantStateV1,
  type SourceMediaRightsRecordV1,
} from './source-media-rights-owner-v1';

export const SOURCE_MEDIA_RIGHTS_LEDGER_SCOPE_KIND_V1 =
  'EDITRON_SOURCE_MEDIA_RIGHTS_LEDGER_SCOPE_V1' as const;
export const SOURCE_MEDIA_RIGHTS_HEAD_COLLECTION_V1 =
  'editron_source_media_rights_heads_v1' as const;
export const SOURCE_MEDIA_RIGHTS_EVENT_COLLECTION_V1 =
  'editron_source_media_rights_events_v1' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

export type SourceMediaRightsLedgerScopeV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof SOURCE_MEDIA_RIGHTS_LEDGER_SCOPE_KIND_V1;
  tenantId: string;
  orgId: string | null;
  projectId: string;
  assetId: string;
  sourceVersionSha256: string;
  scopeSha256: string;
}>;

export interface SourceMediaRightsLedgerReaderV1 {
  read(scope: SourceMediaRightsLedgerScopeV1): Promise<SourceMediaRightsGrantStateV1 | null>;
}

export interface SourceMediaRightsLedgerStorePortsV1
  extends SourceMediaRightsLedgerReaderV1 {
  commit(input: Readonly<{
    scope: SourceMediaRightsLedgerScopeV1;
    expectedState: SourceMediaRightsGrantStateV1 | null;
    nextState: SourceMediaRightsGrantStateV1;
  }>): Promise<boolean>;
}

type SourceMediaRightsHeadDocumentV1 = Readonly<{
  _id: string;
  scopeSha256: string;
  scope: SourceMediaRightsLedgerScopeV1;
  stateSha256: string;
  state: SourceMediaRightsGrantStateV1;
  updatedAt: Date;
}>;

type SourceMediaRightsEventDocumentV1 = Readonly<{
  _id: string;
  scopeSha256: string;
  previousStateSha256: string | null;
  transition: 'ISSUED' | 'REATTESTED' | 'REVOKED';
  state: SourceMediaRightsGrantStateV1;
  recordedAt: Date;
}>;

export type SourceMediaRightsLedgerStoreResultV1 = Readonly<
  | { disposition: 'APPLIED'; scope: SourceMediaRightsLedgerScopeV1; state: SourceMediaRightsGrantStateV1 }
  | { disposition: 'UNCHANGED'; scope: SourceMediaRightsLedgerScopeV1; state: SourceMediaRightsGrantStateV1 }
  | { disposition: 'RACE_LOST' }
  | {
      disposition: 'REJECTED';
      reason:
        | 'NEXT_STATE_INVALID'
        | 'CURRENT_STATE_INVALID'
        | 'EXPECTED_STATE_INVALID'
        | 'EXPECTED_STATE_MISMATCH'
        | 'TRANSITION_INVALID';
    }
>;

export function createSourceMediaRightsLedgerScopeV1(input: Readonly<{
  tenantId: string;
  orgId: string | null;
  projectId: string;
  assetId: string;
  sourceVersionSha256: string;
}>): SourceMediaRightsLedgerScopeV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: SOURCE_MEDIA_RIGHTS_LEDGER_SCOPE_KIND_V1,
    tenantId: identity(input.tenantId, 'SOURCE_MEDIA_RIGHTS_LEDGER_TENANT_INVALID'),
    orgId: input.orgId === null
      ? null
      : identity(input.orgId, 'SOURCE_MEDIA_RIGHTS_LEDGER_ORG_INVALID'),
    projectId: identity(input.projectId, 'SOURCE_MEDIA_RIGHTS_LEDGER_PROJECT_INVALID'),
    assetId: identity(input.assetId, 'SOURCE_MEDIA_RIGHTS_LEDGER_ASSET_INVALID'),
    sourceVersionSha256: sha256(
      input.sourceVersionSha256,
      'SOURCE_MEDIA_RIGHTS_LEDGER_SOURCE_VERSION_INVALID',
    ),
  };
  return Object.freeze({
    ...material,
    scopeSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function sourceMediaRightsLedgerScopeForRecordV1(
  value: SourceMediaRightsRecordV1,
): SourceMediaRightsLedgerScopeV1 {
  return createSourceMediaRightsLedgerScopeV1({
    tenantId: value.tenantId,
    orgId: value.orgId,
    projectId: value.projectId,
    assetId: value.source.assetId,
    sourceVersionSha256: value.source.sourceVersionSha256,
  });
}

export async function persistSourceMediaRightsLedgerTransitionV1(
  input: Readonly<{
    expectedStateSha256: string | null;
    nextState: SourceMediaRightsGrantStateV1;
  }>,
  ports: Readonly<SourceMediaRightsLedgerStorePortsV1>,
): Promise<SourceMediaRightsLedgerStoreResultV1> {
  let expectedStateSha256: string | null;
  try {
    expectedStateSha256 = input.expectedStateSha256 === null
      ? null
      : sha256(
          input.expectedStateSha256,
          'SOURCE_MEDIA_RIGHTS_LEDGER_EXPECTED_STATE_INVALID',
        );
  } catch {
    return { disposition: 'REJECTED', reason: 'EXPECTED_STATE_INVALID' };
  }
  let nextState: SourceMediaRightsGrantStateV1;
  let scope: SourceMediaRightsLedgerScopeV1;
  try {
    nextState = assertSourceMediaRightsGrantStateV1(input.nextState);
    scope = sourceMediaRightsLedgerScopeForRecordV1(nextState.sourceMediaRightsV1);
  } catch {
    return { disposition: 'REJECTED', reason: 'NEXT_STATE_INVALID' };
  }
  if (!ports || typeof ports.read !== 'function' || typeof ports.commit !== 'function') {
    throw new Error('SOURCE_MEDIA_RIGHTS_LEDGER_PORTS_INVALID');
  }

  let currentState: SourceMediaRightsGrantStateV1 | null;
  try {
    const current = await ports.read(scope);
    currentState = current === null
      ? null
      : assertSourceMediaRightsGrantStateV1(current);
    if (currentState && !sameScope(
      scope,
      sourceMediaRightsLedgerScopeForRecordV1(currentState.sourceMediaRightsV1),
    )) {
      throw new Error('SCOPE');
    }
  } catch {
    return { disposition: 'REJECTED', reason: 'CURRENT_STATE_INVALID' };
  }
  if ((currentState?.sourceMediaRightsStateSha256V1 ?? null)
    !== expectedStateSha256) {
    return { disposition: 'REJECTED', reason: 'EXPECTED_STATE_MISMATCH' };
  }
  if (currentState?.sourceMediaRightsStateSha256V1
    === nextState.sourceMediaRightsStateSha256V1) {
    return { disposition: 'UNCHANGED', scope, state: currentState };
  }
  if (!validTransition(currentState, nextState)) {
    return { disposition: 'REJECTED', reason: 'TRANSITION_INVALID' };
  }
  if (!await ports.commit({ scope, expectedState: currentState, nextState })) {
    return { disposition: 'RACE_LOST' };
  }
  return { disposition: 'APPLIED', scope, state: nextState };
}

export async function runSourceMediaRightsLedgerTransitionV1(input: Readonly<{
  expectedStateSha256: string | null;
  nextState: SourceMediaRightsGrantStateV1;
}>): Promise<SourceMediaRightsLedgerStoreResultV1> {
  return persistSourceMediaRightsLedgerTransitionV1(
    input,
    await createSourceMediaRightsLedgerMongoPortsV1(),
  );
}

/**
 * The head and immutable event are committed in one Atlas transaction. The
 * event is never treated as current authority without the CAS-updated head.
 */
export async function createSourceMediaRightsLedgerMongoPortsV1(
): Promise<SourceMediaRightsLedgerStorePortsV1> {
  const { connectToDatabase } = await import('../db/mongodb');
  const { client, db } = await connectToDatabase();
  const heads = db.collection<SourceMediaRightsHeadDocumentV1>(
    SOURCE_MEDIA_RIGHTS_HEAD_COLLECTION_V1,
  );
  const events = db.collection<SourceMediaRightsEventDocumentV1>(
    SOURCE_MEDIA_RIGHTS_EVENT_COLLECTION_V1,
  );
  return {
    read: async (scope) => {
      const normalized = assertScope(scope);
      const head = await heads.findOne({ _id: normalized.scopeSha256 });
      if (!head) return null;
      const stored = head as unknown as Record<string, unknown>;
      if (stored.scopeSha256 !== normalized.scopeSha256
        || hashEditronCanonicalJsonV1(stored.scope)
          !== hashEditronCanonicalJsonV1(normalized)
        || !(stored.updatedAt instanceof Date)) {
        throw new Error('SOURCE_MEDIA_RIGHTS_LEDGER_HEAD_SCOPE_INVALID');
      }
      const state = assertSourceMediaRightsGrantStateV1(stored.state);
      if (stored.stateSha256 !== state.sourceMediaRightsStateSha256V1
        || stored.updatedAt.getTime() !== transitionAt(state).getTime()) {
        throw new Error('SOURCE_MEDIA_RIGHTS_LEDGER_HEAD_STATE_INVALID');
      }
      const event = await events.findOne({
        _id: state.sourceMediaRightsStateSha256V1,
        scopeSha256: normalized.scopeSha256,
      });
      if (!event) throw new Error('SOURCE_MEDIA_RIGHTS_LEDGER_EVENT_MISSING');
      const storedEvent = event as unknown as Record<string, unknown>;
      if (storedEvent.previousStateSha256 !== state.previousStateSha256V1
        || storedEvent.transition !== transitionKind(state)
        || !(storedEvent.recordedAt instanceof Date)
        || storedEvent.recordedAt.getTime() !== transitionAt(state).getTime()
        || hashEditronCanonicalJsonV1(storedEvent.state)
          !== hashEditronCanonicalJsonV1(state)) {
        throw new Error('SOURCE_MEDIA_RIGHTS_LEDGER_EVENT_INVALID');
      }
      return state;
    },
    commit: async ({ scope, expectedState, nextState }) => {
      const normalized = assertScope(scope);
      const expectedSha = expectedState?.sourceMediaRightsStateSha256V1 ?? null;
      const nextSha = nextState.sourceMediaRightsStateSha256V1;
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const headState = {
            scopeSha256: normalized.scopeSha256,
            scope: normalized,
            stateSha256: nextSha,
            state: nextState,
            updatedAt: transitionAt(nextState),
          };
          if (expectedSha === null) {
            await heads.insertOne({
              _id: normalized.scopeSha256,
              ...headState,
            }, { session });
          } else {
            const headFilter: Filter<SourceMediaRightsHeadDocumentV1> = {
              _id: normalized.scopeSha256,
              stateSha256: expectedSha,
            };
            const headResult = await heads.updateOne(
              headFilter,
              {
                $set: headState,
              },
              { session },
            );
            if (headResult.matchedCount !== 1) {
              throw new RightsLedgerRaceError();
            }
          }
          await events.insertOne({
            _id: nextSha,
            scopeSha256: normalized.scopeSha256,
            previousStateSha256: nextState.previousStateSha256V1,
            transition: transitionKind(nextState),
            state: nextState,
            recordedAt: transitionAt(nextState),
          }, { session });
        }, {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
        });
        return true;
      } catch (error) {
        if (error instanceof RightsLedgerRaceError || duplicateKey(error)) return false;
        throw error;
      } finally {
        await session.endSession();
      }
    },
  };
}

function validTransition(
  current: SourceMediaRightsGrantStateV1 | null,
  next: SourceMediaRightsGrantStateV1,
): boolean {
  const nextRecord = next.sourceMediaRightsV1;
  if (!current) {
    return next.previousStateSha256V1 === null
      && nextRecord.supersedesRecordSha256 === null
      && next.sourceMediaRightsRevocationV1 === null;
  }
  if (next.previousStateSha256V1 !== current.sourceMediaRightsStateSha256V1) {
    return false;
  }
  const currentRecord = current.sourceMediaRightsV1;
  if (nextRecord.recordSha256 === currentRecord.recordSha256) {
    return current.sourceMediaRightsRevocationV1 === null
      && next.sourceMediaRightsRevocationV1 !== null;
  }
  const latestAt = current.sourceMediaRightsRevocationV1?.revokedAt
    ?? currentRecord.issuedAt;
  return nextRecord.supersedesRecordSha256 === currentRecord.recordSha256
    && next.sourceMediaRightsRevocationV1 === null
    && Date.parse(nextRecord.issuedAt) >= Date.parse(latestAt);
}

function assertScope(value: SourceMediaRightsLedgerScopeV1): SourceMediaRightsLedgerScopeV1 {
  const rebuilt = createSourceMediaRightsLedgerScopeV1(value);
  if (rebuilt.scopeSha256 !== value.scopeSha256) {
    throw new Error('SOURCE_MEDIA_RIGHTS_LEDGER_SCOPE_HASH_INVALID');
  }
  return rebuilt;
}

function sameScope(
  left: SourceMediaRightsLedgerScopeV1,
  right: SourceMediaRightsLedgerScopeV1,
): boolean {
  return left.scopeSha256 === right.scopeSha256
    && hashEditronCanonicalJsonV1(left) === hashEditronCanonicalJsonV1(right);
}

function transitionAt(state: SourceMediaRightsGrantStateV1): Date {
  return new Date(
    state.sourceMediaRightsRevocationV1?.revokedAt
      ?? state.sourceMediaRightsV1.issuedAt,
  );
}

function transitionKind(
  state: SourceMediaRightsGrantStateV1,
): 'ISSUED' | 'REATTESTED' | 'REVOKED' {
  if (state.sourceMediaRightsRevocationV1) return 'REVOKED';
  return state.sourceMediaRightsV1.supersedesRecordSha256
    ? 'REATTESTED'
    : 'ISSUED';
}

function identity(value: unknown, code: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) throw new Error(code);
  return normalized;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(code);
  return value;
}

function duplicateKey(error: unknown): boolean {
  return Boolean(error && typeof error === 'object'
    && 'code' in error && (error as { code?: unknown }).code === 11000);
}

class RightsLedgerRaceError extends Error {}
