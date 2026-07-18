import { createHash } from 'node:crypto';

import {
  extractBrandVaultUploadEvidenceFromBuffer,
  isSupportedBrandVaultUpload,
} from '@/lib/shared/brand-vault-upload-parser';
import {
  fetchPublicChatReferenceUrl,
  type ChatReferenceUrlFetcherDependencies,
} from './chat-reference-url-fetcher';

export const CHAT_REFERENCE_MAX_FILE_BYTES = 15_000_000;
const CHAT_REFERENCE_MAX_TEXT_CHARS = 50_000;
const CHAT_REFERENCE_LEASE_MS = 60_000;

export type ChatReferenceSourceType = 'document' | 'url';
export type ChatReferenceStatus = 'processing' | 'ready' | 'failed';

export interface ChatReferenceAttachmentRecord {
  referenceId: string;
  userId: string;
  projectId: string;
  sourceType: ChatReferenceSourceType;
  name: string;
  mimeType: string;
  sourceUrl?: string;
  sourceSizeBytes?: number;
  status: ChatReferenceStatus;
  extractedText?: string;
  contentDigest?: string;
  warnings: string[];
  error?: { code: string; message: string };
  leaseExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatReferenceRepository {
  find(referenceId: string, projectId: string): Promise<ChatReferenceAttachmentRecord | null>;
  begin(record: ChatReferenceAttachmentRecord): Promise<ChatReferenceAttachmentRecord>;
  ready(referenceId: string, projectId: string, update: Partial<ChatReferenceAttachmentRecord>): Promise<ChatReferenceAttachmentRecord>;
  failed(referenceId: string, projectId: string, code: string, message: string): Promise<void>;
}

interface ChatReferenceServiceDependencies extends Partial<ChatReferenceUrlFetcherDependencies> {
  repository: ChatReferenceRepository;
  now: () => Date;
}

export class ChatReferenceAttachmentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ChatReferenceAttachmentError';
  }
}

export async function ingestChatDocumentReference(
  input: { userId: string; projectId: string; fileName: string; mimeType?: string; buffer: Buffer },
  dependencies: Partial<ChatReferenceServiceDependencies> = {},
): Promise<ChatReferenceAttachmentRecord> {
  validateIdentity(input.userId, input.projectId);
  const fileName = boundedText(input.fileName, 180) || 'Attached document';
  const mimeType = boundedText(input.mimeType, 120) || 'application/octet-stream';
  if (input.buffer.byteLength === 0) throw new ChatReferenceAttachmentError('reference_empty', 'Attached document is empty.', 400);
  if (input.buffer.byteLength > CHAT_REFERENCE_MAX_FILE_BYTES) {
    throw new ChatReferenceAttachmentError('reference_too_large', 'Attached document exceeds the 15 MB limit.', 413);
  }
  if (!isSupportedDocument(fileName, mimeType)) {
    throw new ChatReferenceAttachmentError('reference_type_unsupported', 'Attach a PDF, DOCX, PPTX, TXT, Markdown, CSV, JSON, HTML, XML, or SVG document.', 415);
  }

  const contentDigest = digest(input.buffer);
  const referenceId = deterministicReferenceId(input.userId, input.projectId, 'document', contentDigest);
  const repository = dependencies.repository ?? defaultRepository;
  const now = (dependencies.now ?? (() => new Date()))();
  const existing = await repository.find(referenceId, input.projectId);
  if (existing && (existing.status === 'ready' || isActive(existing, now))) return existing;

  await repository.begin({
    referenceId,
    userId: input.userId,
    projectId: input.projectId,
    sourceType: 'document',
    name: fileName,
    mimeType,
    sourceSizeBytes: input.buffer.byteLength,
    status: 'processing',
    contentDigest,
    warnings: [],
    leaseExpiresAt: new Date(now.getTime() + CHAT_REFERENCE_LEASE_MS),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  try {
    const parsed = await extractBrandVaultUploadEvidenceFromBuffer({ name: fileName, mimeType, buffer: input.buffer });
    const extractedText = normalizeExtractedText(parsed.source.text);
    if (!extractedText) throw new ChatReferenceAttachmentError('reference_has_no_text', 'No reliable text could be extracted from this document.', 422);
    return repository.ready(referenceId, input.projectId, {
      extractedText,
      contentDigest: digest(extractedText),
      warnings: parsed.warnings.slice(0, 20).map((warning) => boundedText(warning, 400)),
    });
  } catch (error) {
    const normalized = normalizeServiceError(error);
    await repository.failed(referenceId, input.projectId, normalized.code, normalized.message);
    throw normalized;
  }
}

export async function ingestChatUrlReference(
  input: { userId: string; projectId: string; url: string; name?: string },
  dependencies: Partial<ChatReferenceServiceDependencies> = {},
): Promise<ChatReferenceAttachmentRecord> {
  validateIdentity(input.userId, input.projectId);
  const sourceKey = digest(input.url.trim());
  const referenceId = deterministicReferenceId(input.userId, input.projectId, 'url', sourceKey);
  const repository = dependencies.repository ?? defaultRepository;
  const now = (dependencies.now ?? (() => new Date()))();
  const existing = await repository.find(referenceId, input.projectId);
  if (existing && (existing.status === 'ready' || isActive(existing, now))) return existing;

  await repository.begin({
    referenceId,
    userId: input.userId,
    projectId: input.projectId,
    sourceType: 'url',
    name: boundedText(input.name, 180) || 'Web reference',
    mimeType: 'text/html',
    sourceUrl: input.url.trim(),
    status: 'processing',
    warnings: [],
    leaseExpiresAt: new Date(now.getTime() + CHAT_REFERENCE_LEASE_MS),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  try {
    const fetched = await fetchPublicChatReferenceUrl(input.url, {
      ...(dependencies.fetchFn ? { fetchFn: dependencies.fetchFn } : {}),
      ...(dependencies.assertSafeUrl ? { assertSafeUrl: dependencies.assertSafeUrl } : {}),
    });
    const extractedText = normalizeExtractedText(fetched.text);
    return repository.ready(referenceId, input.projectId, {
      name: boundedText(input.name, 180) || boundedText(fetched.name, 180) || 'Web reference',
      mimeType: fetched.contentType,
      sourceUrl: fetched.finalUrl,
      extractedText,
      contentDigest: digest(extractedText),
      warnings: [],
    });
  } catch (error) {
    const normalized = normalizeServiceError(error);
    await repository.failed(referenceId, input.projectId, normalized.code, normalized.message);
    throw normalized;
  }
}

export async function getChatReferenceAttachment(
  referenceId: string,
  projectId: string,
  repository: ChatReferenceRepository = defaultRepository,
): Promise<ChatReferenceAttachmentRecord | null> {
  if (!referenceId.trim() || !projectId.trim()) return null;
  return repository.find(referenceId.trim(), projectId.trim());
}

const defaultRepository: ChatReferenceRepository = {
  async find(referenceId, projectId) {
    const collection = await getChatReferenceCollection();
    return collection
      .findOne({ referenceId, projectId });
  },
  async begin(record) {
    const collection = await getChatReferenceCollection();
    await collection.updateOne(
      { referenceId: record.referenceId, projectId: record.projectId },
      { $set: { ...record, status: 'processing', error: undefined } },
      { upsert: true },
    );
    return record;
  },
  async ready(referenceId, projectId, update) {
    const collection = await getChatReferenceCollection();
    const now = new Date();
    const record = await collection.findOneAndUpdate(
      { referenceId, projectId },
      { $set: { ...update, status: 'ready', error: undefined, leaseExpiresAt: undefined, updatedAt: now } },
      { returnDocument: 'after' },
    );
    if (!record) throw new Error('Chat reference disappeared while completing ingestion.');
    return record;
  },
  async failed(referenceId, projectId, code, message) {
    const collection = await getChatReferenceCollection();
    await collection.updateOne(
      { referenceId, projectId },
      { $set: { status: 'failed', error: { code, message: boundedText(message, 500) }, leaseExpiresAt: undefined, updatedAt: new Date() } },
    );
  },
};

async function getChatReferenceCollection() {
  const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  return db.collection<ChatReferenceAttachmentRecord>(COLLECTIONS.CHAT_REFERENCE_ATTACHMENTS);
}

function deterministicReferenceId(userId: string, projectId: string, sourceType: ChatReferenceSourceType, sourceKey: string): string {
  return `chatref_${digest(`${userId}\u0000${projectId}\u0000${sourceType}\u0000${sourceKey}`).slice(0, 32)}`;
}

function isSupportedDocument(name: string, mimeType: string): boolean {
  if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') return false;
  return isSupportedBrandVaultUpload(name, mimeType);
}

function isActive(record: ChatReferenceAttachmentRecord | null, now: Date): boolean {
  return record?.status === 'processing' && Boolean(record.leaseExpiresAt && record.leaseExpiresAt > now);
}

function validateIdentity(userId: string, projectId: string): void {
  if (!userId.trim() || !projectId.trim()) throw new ChatReferenceAttachmentError('reference_unauthorized', 'Unauthorized.', 401);
}

function normalizeExtractedText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim().slice(0, CHAT_REFERENCE_MAX_TEXT_CHARS)
    : '';
}

function normalizeServiceError(error: unknown): ChatReferenceAttachmentError {
  if (error instanceof ChatReferenceAttachmentError) return error;
  const maybeTyped = error as { code?: unknown; status?: unknown; message?: unknown };
  return new ChatReferenceAttachmentError(
    typeof maybeTyped.code === 'string' ? maybeTyped.code : 'reference_ingestion_failed',
    typeof maybeTyped.message === 'string' ? maybeTyped.message : 'Reference could not be ingested.',
    typeof maybeTyped.status === 'number' ? maybeTyped.status : 500,
  );
}

function digest(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function boundedText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}
