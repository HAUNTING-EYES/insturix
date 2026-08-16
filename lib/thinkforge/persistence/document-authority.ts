import {
  ThinkForgeDocumentContractSchema,
  normalizeThinkForgeDocumentContract,
  thinkForgeDocumentContractMatchesClassification,
  thinkForgeDocumentContractsMatchExactly,
  type ThinkForgeDocumentContract,
} from '../schemas/document-contract';

export type ThinkForgeDocumentAuthorityErrorCode =
  | 'MIGRATION_REQUIRED'
  | 'INVALID_WRITE_AUTHORITY'
  | 'IMMUTABLE_DOCUMENT_KIND';

export class ThinkForgeDocumentAuthorityError extends Error {
  constructor(
    public readonly code: ThinkForgeDocumentAuthorityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ThinkForgeDocumentAuthorityError';
  }
}

export interface ThinkForgeDocumentAuthorityInput {
  sessionId?: unknown;
  scriptId?: unknown;
  title?: unknown;
  documentType?: unknown;
  contentContract?: unknown;
  recordStatus?: unknown;
  version?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ThinkForgePersistedDocumentAuthority {
  sessionId: string;
  scriptId: string;
  title: string;
  documentType: string;
  contentContract: ThinkForgeDocumentContract;
  recordStatus: 'active';
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ThinkForgeDocumentClassification = Pick<
  ThinkForgePersistedDocumentAuthority,
  'documentType' | 'contentContract'
>;

function canonicalDocumentType(contract: ThinkForgeDocumentContract): string {
  return contract.documentKind === 'document' ? contract.artifactType : contract.outputKind;
}

function requireExactString(
  value: unknown,
  label: string,
  code: ThinkForgeDocumentAuthorityErrorCode,
): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new ThinkForgeDocumentAuthorityError(code, `${label} must be a non-empty trimmed string`);
  }
  return value;
}

function parseContract(
  value: unknown,
  label: string,
  code: ThinkForgeDocumentAuthorityErrorCode,
): ThinkForgeDocumentContract {
  const parsed = ThinkForgeDocumentContractSchema.safeParse(value);
  if (!parsed.success) {
    throw new ThinkForgeDocumentAuthorityError(code, `${label} is missing or invalid`);
  }
  return parsed.data;
}

function requirePersistedVersion(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new ThinkForgeDocumentAuthorityError(
      'MIGRATION_REQUIRED',
      'ThinkForge document version must be a positive integer',
    );
  }
  return value as number;
}

function requirePersistedDate(value: unknown, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ThinkForgeDocumentAuthorityError('MIGRATION_REQUIRED', `${label} must be a valid date`);
  }
  return value;
}

function parseDocumentType(
  value: unknown,
  code: ThinkForgeDocumentAuthorityErrorCode,
): { label: string; contract: ThinkForgeDocumentContract } {
  const label = requireExactString(value, 'ThinkForge document type', code);
  const contract = normalizeThinkForgeDocumentContract(label);
  if (!contract) {
    throw new ThinkForgeDocumentAuthorityError(code, `Unsupported ThinkForge document type: ${label}`);
  }
  return { label, contract };
}

function assertMatchingKind(
  contract: ThinkForgeDocumentContract,
  typeContract: ThinkForgeDocumentContract,
  code: ThinkForgeDocumentAuthorityErrorCode,
): void {
  if (!thinkForgeDocumentContractMatchesClassification(contract, typeContract)) {
    throw new ThinkForgeDocumentAuthorityError(code, 'ThinkForge document contract conflicts with document type');
  }
}

export function resolvePersistedThinkForgeDocumentAuthority(
  input: ThinkForgeDocumentAuthorityInput,
): ThinkForgePersistedDocumentAuthority {
  if (input.recordStatus !== 'active') {
    throw new ThinkForgeDocumentAuthorityError(
      'MIGRATION_REQUIRED',
      'ThinkForge document is not an active canonical record',
    );
  }

  const sessionId = requireExactString(input.sessionId, 'ThinkForge session ID', 'MIGRATION_REQUIRED');
  const scriptId = requireExactString(input.scriptId, 'ThinkForge document ID', 'MIGRATION_REQUIRED');
  const title = requireExactString(input.title, 'ThinkForge document title', 'MIGRATION_REQUIRED');
  const contentContract = parseContract(
    input.contentContract,
    'Persisted ThinkForge document contract',
    'MIGRATION_REQUIRED',
  );
  const typeAuthority = parseDocumentType(input.documentType, 'MIGRATION_REQUIRED');
  assertMatchingKind(contentContract, typeAuthority.contract, 'MIGRATION_REQUIRED');
  const version = requirePersistedVersion(input.version);
  const createdAt = requirePersistedDate(input.createdAt, 'ThinkForge document createdAt');
  const updatedAt = requirePersistedDate(input.updatedAt, 'ThinkForge document updatedAt');

  return {
    sessionId,
    scriptId,
    title,
    documentType: canonicalDocumentType(contentContract),
    contentContract,
    recordStatus: 'active',
    version,
    createdAt,
    updatedAt,
  };
}

export function resolveThinkForgeDocumentWriteClassification(
  input: Pick<ThinkForgeDocumentAuthorityInput, 'documentType' | 'contentContract'>,
  existing?: ThinkForgeDocumentAuthorityInput | null,
): ThinkForgeDocumentClassification {
  const existingAuthority = existing
    ? resolvePersistedThinkForgeDocumentAuthority(existing)
    : null;
  const explicitContract = input.contentContract === undefined
    ? null
    : parseContract(input.contentContract, 'ThinkForge document contract', 'INVALID_WRITE_AUTHORITY');
  const explicitType = input.documentType === undefined
    ? null
    : parseDocumentType(input.documentType, 'INVALID_WRITE_AUTHORITY');

  if (explicitContract && explicitType) {
    assertMatchingKind(explicitContract, explicitType.contract, 'INVALID_WRITE_AUTHORITY');
  }

  if (existingAuthority) {
    if (explicitContract
      && !thinkForgeDocumentContractsMatchExactly(existingAuthority.contentContract, explicitContract)) {
      throw new ThinkForgeDocumentAuthorityError(
        'IMMUTABLE_DOCUMENT_KIND',
        'ThinkForge document contract cannot change after creation',
      );
    }
    if (explicitType
      && !thinkForgeDocumentContractMatchesClassification(existingAuthority.contentContract, explicitType.contract)) {
      throw new ThinkForgeDocumentAuthorityError(
        'IMMUTABLE_DOCUMENT_KIND',
        'ThinkForge document contract cannot change after creation',
      );
    }
    return {
      documentType: existingAuthority.documentType,
      contentContract: existingAuthority.contentContract,
    };
  }

  if (!explicitContract) {
    throw new ThinkForgeDocumentAuthorityError(
      'INVALID_WRITE_AUTHORITY',
      'An explicit ThinkForge document contract is required for a new document',
    );
  }

  return {
    documentType: canonicalDocumentType(explicitContract),
    contentContract: explicitContract,
  };
}
