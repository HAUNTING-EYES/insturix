import {
  ThinkForgeDocumentContractSchema,
  normalizeThinkForgeDocumentContract,
  thinkForgeDocumentContractMatchesClassification,
  type ThinkForgeDocumentContract,
} from '../schemas/document-contract';
import type { ObjectId } from 'mongodb';

export const THINKFORGE_DOCUMENT_MIGRATION_VERSION = 1;

export type ThinkForgeDocumentMigrationSource =
  | 'stored_contract'
  | 'stored_document_type'
  | 'session_contract'
  | 'session_format'
  | 'legacy_stored_document_type';

export interface LegacyThinkForgeDocumentRecord {
  _id: ObjectId | string;
  sessionId?: unknown;
  scriptId?: unknown;
  title?: unknown;
  documentType?: unknown;
  contentContract?: unknown;
  content?: unknown;
}

export interface LegacyThinkForgeSessionRecord {
  _id: string;
  projectMeta?: unknown;
}

export type ThinkForgeDocumentMigrationDecision =
  | {
      recordId: ObjectId | string;
      status: 'active';
      source: ThinkForgeDocumentMigrationSource;
      update: {
        scriptId: string;
        title: string;
        documentType: string;
        contentContract: ThinkForgeDocumentContract;
        recordStatus: 'active';
        documentContractMigration: {
          version: number;
          source: ThinkForgeDocumentMigrationSource;
        };
      };
    }
  | {
      recordId: ObjectId | string;
      status: 'quarantined';
      reason: string;
      update: {
        recordStatus: 'quarantined';
        documentContractMigration: {
          version: number;
          reason: string;
        };
      };
    };

export interface ThinkForgeDocumentMigrationPlan {
  decisions: ThinkForgeDocumentMigrationDecision[];
  summary: {
    scanned: number;
    active: number;
    quarantined: number;
  };
}

type ParsedIdentity =
  | { status: 'exact'; value: string }
  | { status: 'missing' }
  | { status: 'invalid'; reason: string };

function parseExactIdentity(value: unknown, label: string): ParsedIdentity {
  if (value === undefined || value === null || value === '') return { status: 'missing' };
  if (typeof value !== 'string') {
    return { status: 'invalid', reason: `${label} must be a string` };
  }
  if (!value.trim()) {
    return { status: 'invalid', reason: `${label} cannot contain only whitespace` };
  }
  if (value !== value.trim()) {
    return { status: 'invalid', reason: `${label} must not contain surrounding whitespace` };
  }
  return { status: 'exact', value };
}

function canonicalDocumentType(contract: ThinkForgeDocumentContract): string {
  return contract.documentKind === 'document' ? contract.artifactType : contract.outputKind;
}

function defaultTitle(contract: ThinkForgeDocumentContract): string {
  if (contract.outputKind === 'social_post') return 'Untitled Post';
  if (contract.outputKind === 'carousel') return 'Untitled Carousel';
  if (contract.outputKind === 'video_script') return 'Untitled Script';
  return 'Untitled Document';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseContractValue(value: unknown, label: string): ThinkForgeDocumentContract {
  const parsed = ThinkForgeDocumentContractSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${label} is invalid`);
  return parsed.data;
}

function parseDocumentType(value: unknown, label: string): ThinkForgeDocumentContract | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid`);
  const contract = normalizeThinkForgeDocumentContract(value);
  if (!contract) throw new Error(`${label} is unsupported`);
  return contract;
}

function parseSessionFormat(value: unknown): ThinkForgeDocumentContract | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('session format is invalid');
  if (!value.trim()) return null;
  return normalizeThinkForgeDocumentContract(value);
}

function isLegacyScreenplayDefault(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'screenplay';
}

function requireMigrationReadyContract(
  contract: ThinkForgeDocumentContract,
): ThinkForgeDocumentContract {
  if (contract.outputKind === 'carousel' && contract.carouselSlideCount === undefined) {
    throw new Error('carousel contract is missing an authoritative slide count');
  }
  return contract;
}

function resolveMigrationContract(
  document: LegacyThinkForgeDocumentRecord,
  session?: LegacyThinkForgeSessionRecord,
): { contract: ThinkForgeDocumentContract; source: ThinkForgeDocumentMigrationSource } {
  const storedContract = document.contentContract !== undefined && document.contentContract !== null
    ? parseContractValue(document.contentContract, 'stored contentContract')
    : null;
  const storedTypeContract = parseDocumentType(document.documentType, 'stored documentType');
  const storedTypeIsLegacyDefault = isLegacyScreenplayDefault(document.documentType);

  if (storedContract && storedTypeContract && !storedTypeIsLegacyDefault
    && !thinkForgeDocumentContractMatchesClassification(storedContract, storedTypeContract)) {
    throw new Error('stored contentContract conflicts with stored documentType');
  }
  if (storedContract) {
    return { contract: requireMigrationReadyContract(storedContract), source: 'stored_contract' };
  }
  if (storedTypeContract && !storedTypeIsLegacyDefault) {
    return {
      contract: requireMigrationReadyContract(storedTypeContract),
      source: 'stored_document_type',
    };
  }

  const projectMeta = asRecord(session?.projectMeta);
  if (projectMeta?.contentContract !== undefined && projectMeta.contentContract !== null) {
    return {
      contract: requireMigrationReadyContract(
        parseContractValue(projectMeta.contentContract, 'session contentContract'),
      ),
      source: 'session_contract',
    };
  }

  const sessionFormatContract = parseSessionFormat(projectMeta?.format);
  if (sessionFormatContract) {
    return {
      contract: requireMigrationReadyContract(sessionFormatContract),
      source: 'session_format',
    };
  }

  if (storedTypeContract) {
    return {
      contract: requireMigrationReadyContract(storedTypeContract),
      source: 'legacy_stored_document_type',
    };
  }

  throw new Error('no persisted document authority is available');
}

function quarantine(recordId: ObjectId | string, reason: string): ThinkForgeDocumentMigrationDecision {
  return {
    recordId,
    status: 'quarantined',
    reason,
    update: {
      recordStatus: 'quarantined',
      documentContractMigration: {
        version: THINKFORGE_DOCUMENT_MIGRATION_VERSION,
        reason,
      },
    },
  };
}

export function planThinkForgeDocumentContractMigration(input: {
  documents: readonly LegacyThinkForgeDocumentRecord[];
  sessions: readonly LegacyThinkForgeSessionRecord[];
}): ThinkForgeDocumentMigrationPlan {
  const sessionsById = new Map<string, LegacyThinkForgeSessionRecord>();
  for (const session of input.sessions) {
    const identity = parseExactIdentity(session._id, 'session ID');
    if (identity.status === 'exact') sessionsById.set(identity.value, session);
  }

  const prepared = input.documents.map((document) => ({
    document,
    sessionIdentity: parseExactIdentity(document.sessionId, 'session ID'),
    scriptIdentity: parseExactIdentity(document.scriptId, 'document ID'),
  }));
  const exactIdentityCounts = new Map<string, number>();
  const missingIdentityCounts = new Map<string, number>();

  for (const candidate of prepared) {
    if (candidate.sessionIdentity.status !== 'exact') continue;
    const sessionId = candidate.sessionIdentity.value;
    if (candidate.scriptIdentity.status === 'exact') {
      const key = `${sessionId}\u0000${candidate.scriptIdentity.value}`;
      exactIdentityCounts.set(key, (exactIdentityCounts.get(key) ?? 0) + 1);
    } else if (candidate.scriptIdentity.status === 'missing') {
      missingIdentityCounts.set(sessionId, (missingIdentityCounts.get(sessionId) ?? 0) + 1);
    }
  }

  const decisions = prepared.map(({ document, sessionIdentity, scriptIdentity }) => {
    if (sessionIdentity.status !== 'exact') {
      return quarantine(document._id, sessionIdentity.status === 'invalid'
        ? sessionIdentity.reason
        : 'session ID is missing');
    }
    if (scriptIdentity.status === 'invalid') {
      return quarantine(document._id, scriptIdentity.reason);
    }

    const sessionId = sessionIdentity.value;
    let scriptId: string;
    if (scriptIdentity.status === 'exact') {
      scriptId = scriptIdentity.value;
      const key = `${sessionId}\u0000${scriptId}`;
      if ((exactIdentityCounts.get(key) ?? 0) > 1) {
        return quarantine(document._id, `duplicate document ID in session: ${scriptId}`);
      }
    } else {
      if ((missingIdentityCounts.get(sessionId) ?? 0) !== 1) {
        return quarantine(document._id, 'multiple documents without IDs exist in the session');
      }
      const defaultKey = `${sessionId}\u0000default`;
      if ((exactIdentityCounts.get(defaultKey) ?? 0) > 0) {
        return quarantine(document._id, 'legacy default document collides with an existing default ID');
      }
      scriptId = 'default';
    }

    try {
      const { contract, source } = resolveMigrationContract(document, sessionsById.get(sessionId));
      const title = typeof document.title === 'string' && document.title.trim()
        ? document.title.trim()
        : defaultTitle(contract);
      return {
        recordId: document._id,
        status: 'active' as const,
        source,
        update: {
          scriptId,
          title,
          documentType: canonicalDocumentType(contract),
          contentContract: contract,
          recordStatus: 'active' as const,
          documentContractMigration: {
            version: THINKFORGE_DOCUMENT_MIGRATION_VERSION,
            source,
          },
        },
      };
    } catch (error) {
      return quarantine(
        document._id,
        error instanceof Error ? error.message : 'document contract migration failed',
      );
    }
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
