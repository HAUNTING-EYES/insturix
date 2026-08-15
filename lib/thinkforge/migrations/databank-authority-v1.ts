import { classifyLegacyGlobalDataBankProvenance, type DataBankEntry } from '../services/db';
import { inspectDataForStorage } from '../privacy/provider-privacy-gateway';
import type { ObjectId } from 'mongodb';

export const THINKFORGE_DATABANK_AUTHORITY_MIGRATION_VERSION = 1;

export interface LegacyDataBankRecord extends Record<string, unknown> {
  _id: ObjectId | string;
  sessionId?: unknown;
  userId?: unknown;
  type?: unknown;
  scope?: unknown;
  memoryScope?: unknown;
  brandId?: unknown;
  provenanceStatus?: unknown;
  title?: unknown;
  content?: unknown;
  sourceUrl?: unknown;
  tags?: unknown;
}

export interface LegacyDataBankSessionRecord {
  _id: string;
  userId?: unknown;
  orgId?: unknown;
  projectMeta?: unknown;
}

export type DataBankAuthorityMigrationDecision = {
  recordId: ObjectId | string;
  status: 'active' | 'quarantined';
  reason?: string;
  update: {
    $set: Record<string, unknown>;
    $unset: Record<string, ''>;
  };
};

function exactString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() === value && value.length > 0
    ? value
    : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function quarantine(
  record: LegacyDataBankRecord,
  reason: string,
  evidence: Record<string, unknown> = {},
): DataBankAuthorityMigrationDecision {
  return {
    recordId: record._id,
    status: 'quarantined',
    reason,
    update: {
      $set: {
        ...evidence,
        provenanceStatus: 'quarantined',
        lifecycleStatus: 'superseded',
        embeddingStatus: 'failed',
        dataBankAuthorityMigration: {
          version: THINKFORGE_DATABANK_AUTHORITY_MIGRATION_VERSION,
          status: 'quarantined',
          reason,
        },
      },
      $unset: {
        embeddingNextRetryAt: '',
        embeddingLeaseExpiresAt: '',
      },
    },
  };
}

function resolveSessionOwner(
  record: LegacyDataBankRecord,
  session: LegacyDataBankSessionRecord | undefined,
): { ownerType: 'user' | 'organization'; userId: string; orgId?: string } | { reason: string } {
  if (!session) return { reason: 'missing_session_owner_evidence' };
  const recordUserId = exactString(record.userId);
  if (!recordUserId) return { reason: 'missing_record_user' };
  const orgId = exactString(session.orgId);
  if (orgId) return { ownerType: 'organization', userId: recordUserId, orgId };
  const sessionUserId = exactString(session.userId);
  if (!sessionUserId || sessionUserId !== recordUserId) {
    return { reason: 'personal_session_owner_mismatch' };
  }
  return { ownerType: 'user', userId: recordUserId };
}

function resolveProvenance(
  record: LegacyDataBankRecord,
  session: LegacyDataBankSessionRecord,
): { memoryScope: 'project' | 'brand' | 'universal'; brandId?: string; tags: string[] } | { reason: string } {
  if (record.scope === 'project') {
    if (record.memoryScope !== undefined && record.memoryScope !== null && record.memoryScope !== 'project') {
      return { reason: 'project_memory_scope_conflict' };
    }
    const tags = Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      : [];
    return { memoryScope: 'project', tags: [...new Set([...tags, 'memory:project'])] };
  }
  if (record.scope !== 'global') return { reason: 'missing_or_invalid_data_scope' };

  const classified = classifyLegacyGlobalDataBankProvenance(record as unknown as DataBankEntry);
  if (classified.status === 'quarantined') return { reason: `global_${classified.reason}` };
  if (classified.memoryScope === 'brand') {
    const sessionBrandId = exactString(recordValue(session.projectMeta)?.brandId);
    if (!sessionBrandId || sessionBrandId !== classified.brandId) {
      return { reason: 'brand_session_mismatch' };
    }
  }
  return {
    memoryScope: classified.memoryScope,
    ...(classified.brandId ? { brandId: classified.brandId } : {}),
    tags: classified.tags,
  };
}

function inspectLegacyStorage(record: LegacyDataBankRecord) {
  try {
    return inspectDataForStorage({
      text: JSON.stringify({
        title: record.title,
        content: record.content,
        sourceUrl: record.sourceUrl,
        tags: record.tags,
      }),
      declaredPrivacyClass: 'business_confidential',
    });
  } catch {
    return null;
  }
}

export function planDataBankAuthorityMigration(input: {
  records: readonly LegacyDataBankRecord[];
  sessions: readonly LegacyDataBankSessionRecord[];
}) {
  const sessions = new Map(input.sessions.map((session) => [session._id, session]));
  const decisions = input.records.map((record): DataBankAuthorityMigrationDecision => {
    const sessionId = exactString(record.sessionId);
    if (!sessionId) return quarantine(record, 'missing_session_owner_evidence');
    const session = sessions.get(sessionId);
    const owner = resolveSessionOwner(record, session);
    if ('reason' in owner) return quarantine(record, owner.reason);
    const ownerEvidence = {
      ownerType: owner.ownerType,
      userId: owner.userId,
      ...(owner.orgId ? { orgId: owner.orgId } : {}),
    };
    if (!session) return quarantine(record, 'missing_session_owner_evidence', ownerEvidence);

    const storage = inspectLegacyStorage(record);
    if (!storage) return quarantine(record, 'uninspectable_legacy_content', ownerEvidence);
    if (storage.privacyClass === 'child_data') {
      return quarantine(record, 'legacy_child_data_without_consent', {
        ...ownerEvidence,
        classification: 'child_data',
      });
    }
    if (storage.containsPersonalData || storage.privacyClass === 'personal') {
      return quarantine(record, 'legacy_personal_data_without_consent', {
        ...ownerEvidence,
        classification: 'personal',
      });
    }

    const provenance = resolveProvenance(record, session);
    if ('reason' in provenance) return quarantine(record, provenance.reason, ownerEvidence);
    return {
      recordId: record._id,
      status: 'active',
      update: {
        $set: {
          ...ownerEvidence,
          classification: 'business_confidential',
          consentStatus: 'not_required',
          lifecycleStatus: 'active',
          provenanceStatus: 'verified',
          memoryScope: provenance.memoryScope,
          ...(provenance.brandId ? { brandId: provenance.brandId } : {}),
          tags: provenance.tags,
          embeddingStatus: 'pending',
          dataBankAuthorityMigration: {
            version: THINKFORGE_DATABANK_AUTHORITY_MIGRATION_VERSION,
            status: 'active',
            source: 'exact_session_authority',
          },
        },
        $unset: {
          ...(owner.ownerType === 'user' ? { orgId: '' as const } : {}),
          ...(!provenance.brandId ? { brandId: '' as const } : {}),
          provenanceReason: '',
          embeddingMetadataVersion: '',
          embeddingNextRetryAt: '',
          embeddingLeaseExpiresAt: '',
          vectorId: '',
        },
      },
    };
  });

  const active = decisions.filter((decision) => decision.status === 'active').length;
  return {
    decisions,
    summary: {
      scanned: decisions.length,
      active,
      quarantined: decisions.length - active,
    },
  };
}
