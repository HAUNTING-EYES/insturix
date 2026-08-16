import { describe, expect, it } from 'vitest';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import { planThinkForgeDocumentContractMigration } from '@/lib/thinkforge/migrations/document-contract-v1';

function plan(documents: Array<Record<string, unknown>>, projectMeta?: Record<string, unknown>) {
  return planThinkForgeDocumentContractMigration({
    documents: documents.map((document, index) => ({
      _id: typeof document._id === 'string' ? document._id : `doc_${index}`,
      sessionId: 'session_1',
      ...document,
    })),
    sessions: [{ _id: 'session_1', projectMeta }],
  });
}

describe('ThinkForge document contract migration', () => {
  it('preserves a valid stored contract as the highest authority', () => {
    const contentContract = createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 });
    const result = plan([{
      scriptId: 'deck_1',
      title: 'Launch',
      documentType: 'carousel',
      contentContract,
    }]);

    expect(result.summary).toEqual({ scanned: 1, active: 1, quarantined: 0 });
    expect(result.decisions[0]).toMatchObject({
      status: 'active',
      source: 'stored_contract',
      update: { scriptId: 'deck_1', documentType: 'carousel', contentContract },
    });
  });

  it('quarantines a stored carousel contract without an authoritative slide count', () => {
    const result = plan([{
      scriptId: 'deck_1',
      contentContract: createThinkForgeWriterContract('carousel'),
    }]);

    expect(result.summary).toEqual({ scanned: 1, active: 0, quarantined: 1 });
    expect(result.decisions[0]).toMatchObject({
      status: 'quarantined',
      reason: 'carousel contract is missing an authoritative slide count',
    });
  });

  it('quarantines a legacy carousel label instead of guessing its slide count', () => {
    const result = plan([{ scriptId: 'deck_1', documentType: 'carousel' }]);

    expect(result.decisions[0]).toMatchObject({
      status: 'quarantined',
      reason: 'carousel contract is missing an authoritative slide count',
    });
  });

  it('migrates from an explicit stored legacy document type', () => {
    const result = plan([{ scriptId: 'post_1', documentType: 'post' }]);
    expect(result.decisions[0]).toMatchObject({
      status: 'active',
      source: 'stored_document_type',
      update: { documentType: 'social_post', title: 'Untitled Post' },
    });
  });

  it('uses the persisted session contract before legacy session format', () => {
    const sessionContract = createThinkForgeWriterContract('social_post');
    const result = plan(
      [{ scriptId: 'post_1' }],
      { contentContract: sessionContract, format: 'video script' },
    );
    expect(result.decisions[0]).toMatchObject({
      status: 'active',
      source: 'session_contract',
      update: { documentType: 'social_post' },
    });
  });

  it('does not let the old screenplay schema default override a session contract', () => {
    const sessionContract = createThinkForgeWriterContract('carousel', { carouselSlideCount: 4 });
    const result = plan(
      [{ scriptId: 'deck_1', documentType: 'screenplay' }],
      { contentContract: sessionContract },
    );
    expect(result.decisions[0]).toMatchObject({
      status: 'active',
      source: 'session_contract',
      update: { documentType: 'carousel' },
    });
  });

  it('uses explicit session format over the old screenplay schema default', () => {
    const result = plan(
      [{ scriptId: 'post_1', documentType: 'screenplay' }],
      { format: 'LinkedIn post' },
    );
    expect(result.decisions[0]).toMatchObject({
      status: 'active',
      source: 'session_format',
      update: { documentType: 'social_post' },
    });
  });

  it('uses the old screenplay field only when no stronger persisted authority exists', () => {
    const result = plan([{ scriptId: 'script_1', documentType: 'screenplay' }]);
    expect(result.decisions[0]).toMatchObject({
      status: 'active',
      source: 'legacy_stored_document_type',
      update: { documentType: 'video_script' },
    });
  });

  it('treats a descriptive legacy session format as non-authoritative', () => {
    const result = plan(
      [{ scriptId: 'script_1', documentType: 'screenplay' }],
      { format: 'Keynote speeches and expert panel discussion on policy' },
    );
    expect(result.decisions[0]).toMatchObject({
      status: 'active',
      source: 'legacy_stored_document_type',
      update: { documentType: 'video_script' },
    });
  });

  it('uses explicit legacy session format only when no stronger authority exists', () => {
    const result = plan([{ scriptId: 'script_1' }], { format: 'YouTube video script' });
    expect(result.decisions[0]).toMatchObject({
      status: 'active',
      source: 'session_format',
      update: { documentType: 'video_script' },
    });
  });

  it('assigns default only to one collision-free legacy no-ID record', () => {
    const result = plan([{ documentType: 'post' }]);
    expect(result.decisions[0]).toMatchObject({ status: 'active', update: { scriptId: 'default' } });
  });

  it.each([
    {
      name: 'conflicting stored authorities',
      documents: [{
        scriptId: 'doc_1',
        documentType: 'post',
        contentContract: createThinkForgeWriterContract('video_script'),
      }],
      reason: 'conflicts',
    },
    {
      name: 'duplicate exact IDs',
      documents: [{ scriptId: 'same', documentType: 'post' }, { scriptId: 'same', documentType: 'post' }],
      reason: 'duplicate document ID',
    },
    {
      name: 'multiple missing IDs',
      documents: [{ documentType: 'post' }, { documentType: 'post' }],
      reason: 'multiple documents without IDs',
    },
    {
      name: 'default collision',
      documents: [{ scriptId: 'default', documentType: 'post' }, { documentType: 'post' }],
      reason: 'collides',
    },
    {
      name: 'surrounding identity whitespace',
      documents: [{ scriptId: ' doc_1 ', documentType: 'post' }],
      reason: 'surrounding whitespace',
    },
  ])('quarantines $name instead of choosing a winner', ({ documents, reason }) => {
    const result = plan(documents);
    const quarantined = result.decisions.filter((decision) => decision.status === 'quarantined');
    expect(quarantined.length).toBeGreaterThan(0);
    expect(quarantined.some((decision) => decision.reason.includes(reason))).toBe(true);
  });

  it('never infers document kind from stored content', () => {
    const result = plan([{ scriptId: 'doc_1', content: 'Write a YouTube video with six scenes.' }]);
    expect(result.decisions[0]).toMatchObject({
      status: 'quarantined',
      reason: 'no persisted document authority is available',
    });
  });
});
