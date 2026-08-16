import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ThinkForgeDocumentAuthorityError,
  resolvePersistedThinkForgeDocumentAuthority,
  resolveThinkForgeDocumentWriteClassification,
} from '@/lib/thinkforge/persistence/document-authority';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

const createdAt = new Date('2026-08-15T10:00:00.000Z');
const updatedAt = new Date('2026-08-15T11:00:00.000Z');

function activePost(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'session_1',
    scriptId: 'post_1',
    title: 'Launch proof',
    documentType: 'social_post',
    contentContract: createThinkForgeWriterContract('social_post'),
    recordStatus: 'active',
    version: 2,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function activeCarousel(overrides: Record<string, unknown> = {}) {
  return activePost({
    scriptId: 'carousel_1',
    title: 'Launch carousel',
    documentType: 'carousel',
    contentContract: createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 }),
    ...overrides,
  });
}

function expectAuthorityError(run: () => unknown, code: ThinkForgeDocumentAuthorityError['code']) {
  try {
    run();
    throw new Error('Expected ThinkForgeDocumentAuthorityError');
  } catch (error) {
    expect(error).toBeInstanceOf(ThinkForgeDocumentAuthorityError);
    expect((error as ThinkForgeDocumentAuthorityError).code).toBe(code);
  }
}

describe('ThinkForge persisted document authority', () => {
  it('returns exact authority only for a complete active canonical record', () => {
    expect(resolvePersistedThinkForgeDocumentAuthority(activePost())).toEqual({
      sessionId: 'session_1',
      scriptId: 'post_1',
      title: 'Launch proof',
      documentType: 'social_post',
      contentContract: createThinkForgeWriterContract('social_post'),
      recordStatus: 'active',
      version: 2,
      createdAt,
      updatedAt,
    });
  });

  it.each([
    ['quarantined status', { recordStatus: 'quarantined' }],
    ['missing status', { recordStatus: undefined }],
    ['whitespace session ID', { sessionId: ' session_1 ' }],
    ['missing document ID', { scriptId: undefined }],
    ['blank title', { title: '   ' }],
    ['missing contract', { contentContract: undefined }],
    ['unsupported type', { documentType: 'mystery' }],
    ['invalid version', { version: 0 }],
    ['invalid createdAt', { createdAt: '2026-08-15' }],
  ])('fails closed for %s', (_name, overrides) => {
    expectAuthorityError(
      () => resolvePersistedThinkForgeDocumentAuthority(activePost(overrides)),
      'MIGRATION_REQUIRED',
    );
  });

  it('rejects conflicting persisted type and contract', () => {
    expectAuthorityError(
      () => resolvePersistedThinkForgeDocumentAuthority(activePost({
        documentType: 'video_script',
      })),
      'MIGRATION_REQUIRED',
    );
  });
});

describe('ThinkForge document write authority', () => {
  it('requires an explicit contract for a new document instead of inventing a script', () => {
    expectAuthorityError(
      () => resolveThinkForgeDocumentWriteClassification({}),
      'INVALID_WRITE_AUTHORITY',
    );
  });

  it('canonicalizes a new document from its explicit contract', () => {
    const contentContract = createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 });
    expect(resolveThinkForgeDocumentWriteClassification({ contentContract })).toEqual({
      documentType: 'carousel',
      contentContract,
    });
  });

  it('preserves stored classification when an update omits it', () => {
    expect(resolveThinkForgeDocumentWriteClassification({}, activePost())).toEqual({
      documentType: 'social_post',
      contentContract: createThinkForgeWriterContract('social_post'),
    });
  });

  it('rejects changing an existing document kind', () => {
    expectAuthorityError(
      () => resolveThinkForgeDocumentWriteClassification({
        contentContract: createThinkForgeWriterContract('video_script'),
      }, activePost()),
      'IMMUTABLE_DOCUMENT_KIND',
    );
  });

  it('rejects changing an existing carousel slide-count contract', () => {
    expectAuthorityError(
      () => resolveThinkForgeDocumentWriteClassification({
        contentContract: createThinkForgeWriterContract('carousel', { carouselSlideCount: 6 }),
      }, activeCarousel()),
      'IMMUTABLE_DOCUMENT_KIND',
    );
  });

  it('treats a count-less carousel type as classification without erasing the stored count', () => {
    const storedContract = createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 });
    expect(resolveThinkForgeDocumentWriteClassification(
      { documentType: 'carousel' },
      activeCarousel({ contentContract: storedContract }),
    )).toEqual({
      documentType: 'carousel',
      contentContract: storedContract,
    });
  });

  it('keeps runtime storage free of legacy screenplay and ID fallbacks', () => {
    const source = readFileSync('lib/thinkforge/services/db.ts', 'utf8');
    expect(source).not.toContain("createThinkForgeWriterContract('video_script')");
    expect(source).not.toContain("scriptId: { $exists: false }");
    expect(source).not.toContain("documentType: { type: String, default: 'screenplay' }");
    expect(source).toContain("recordStatus: 'active'");
  });
});
