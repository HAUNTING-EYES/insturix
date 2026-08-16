import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyCommand: vi.fn(),
  buildSourceLedger: vi.fn(),
  buildSignalTrace: vi.fn(),
  formatSignalProfile: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  getWritingKnowledgeVersion: vi.fn(),
  postRun: vi.fn(),
  resolveAuthoringContext: vi.fn(),
  resolveProductionBrief: vi.fn(),
  resolveSignalProfile: vi.fn(),
  scriptRun: vi.fn(),
}));

vi.mock('@/lib/thinkforge/agents/post-writer-agent', () => ({
  PostWriterAgent: class {
    runStructured = mocks.postRun;
  },
}));

vi.mock('@/lib/thinkforge/agents/script-writer-agent', () => ({
  ScriptWriterAgent: class {
    runStructured = mocks.scriptRun;
  },
}));

vi.mock('@/lib/thinkforge/context/resolved-authoring-context', () => ({
  resolveThinkForgeAuthoringContext: mocks.resolveAuthoringContext,
}));

vi.mock('@/lib/thinkforge/data/writing-graph-query', () => ({
  getVersion: mocks.getWritingKnowledgeVersion,
}));

vi.mock('@/lib/thinkforge/brief/resolve-production-brief', () => ({
  resolveThinkForgeProductionBrief: mocks.resolveProductionBrief,
}));

vi.mock('@/lib/thinkforge/provenance/source-ledger-continuity', () => ({
  buildContinuedThinkForgeSourceLedger: mocks.buildSourceLedger,
}));

vi.mock('@/lib/thinkforge/signals', () => ({
  buildThinkForgeSignalTrace: mocks.buildSignalTrace,
  formatContentSignalProfileForPrompt: mocks.formatSignalProfile,
  resolveContentSignalProfile: mocks.resolveSignalProfile,
}));

vi.mock('@/lib/thinkforge/services/command-service', () => ({
  applyCommand: mocks.applyCommand,
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  getScript: mocks.getScript,
  getSession: mocks.getSession,
}));

import { reviseDocumentViaFlatWriter } from '@/lib/thinkforge/services/flat-writer-edit';

const signalProfile = {
  profile: { constraints: {}, signals: {}, derived: {}, _inference_metadata: {} },
  intent: { outputFormat: 'social_post', proofPoints: [], forbiddenTerms: [] },
  sources: {},
  warnings: [],
};

const sourceLedger = { ledgerVersion: 1, entries: [] };
const productionBrief = {
  output: { platform: 'linkedin', count: 1, format: 'auto-edit' },
  resolution: { fieldConfidence: {}, confirmed: [], inferred: [] },
  entryPoint: 'thinkforge',
  brand: { brandId: 'brand_b' },
};

const authoringContext = {
  projectMeta: {
    brandId: 'brand_b',
    brandBinding: {
      version: 1,
      brandId: 'brand_b',
      scope: 'organization',
      boundAt: '2026-08-13T00:00:00.000Z',
    },
    format: 'LinkedIn post',
    platform: 'linkedin',
    idea: 'Approval ownership',
  },
  retrievedContext: {
    projectFacts: [],
    globalFacts: [],
    interactionPatterns: [],
  },
  systemBrief: 'Canonical Brand B voice and kill-list.',
  snapshot: {
    version: 1,
    resolvedAt: '2026-08-13T00:00:00.000Z',
    scope: { kind: 'organization', brandId: 'brand_b' },
    brand: {
      brandId: 'brand_b',
      recordId: 'profile_b_13',
      profileUpdatedAt: '2026-08-13T00:00:00.000Z',
      profileFingerprint: 'a'.repeat(64),
    },
    retrieval: { projectFactIds: [], globalFactIds: [], interactionPatternTypes: [] },
    writingKnowledgeVersion: 'writing-v4',
  },
};

function postResult() {
  return {
    content: 'Approval ownership must be visible before launch. Name one owner and one deadline.',
    hashtags: ['#ContentOperations'],
    contentAnalysis: { tone: 'direct', vibe: 'practical', theme: 'ownership', qualityScore: 94, violations: [] },
    clickatron: { singleImagePrompt: 'One labelled-free approval board with a single highlighted owner lane.' },
    metadata: { platform: 'linkedin', charCount: 82 },
  };
}

function scriptResult() {
  return {
    content: '## Scene 1: Ownership\n**Narration:** Name one owner before launch.\n**Visual:** One owner moves the launch card.',
    contentAnalysis: { hooks: ['Name one owner'], theme: 'ownership', emphasisPoints: ['one owner'], qualityScore: 94 },
    visualMetadata: { motionInfo: 'Measured', scenePrompts: ['One owner moves one launch card.'] },
    metadata: { estimatedTimeSeconds: 10, platform: 'youtube', voiceLanguage: 'en' },
    sidecar: { sidecarVersion: 1, characters: [], scenes: [], sourceRefs: [] },
  };
}

describe('flat writer edit authoring context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      _id: 'session_1',
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: authoringContext.projectMeta,
    });
    mocks.resolveAuthoringContext.mockResolvedValue(authoringContext);
    mocks.getWritingKnowledgeVersion.mockReturnValue('writing-v4');
    mocks.resolveSignalProfile.mockReturnValue(signalProfile);
    mocks.formatSignalProfile.mockReturnValue('<content_signal_profile>resolved</content_signal_profile>');
    mocks.buildSignalTrace.mockReturnValue({ version: 1, selectedIntent: { outputFormat: 'social_post' } });
    mocks.resolveProductionBrief.mockReturnValue(productionBrief);
    mocks.buildSourceLedger.mockReturnValue(sourceLedger);
    mocks.applyCommand.mockResolvedValue({ ok: true, script: { version: 2 } });
  });

  it('re-resolves the bound brand for post edits and persists a fresh authoring receipt', async () => {
    const stored = {
      sessionId: 'session_1',
      scriptId: 'post_1',
      title: 'Approval post',
      content: 'Old post content',
      blocks: [{ id: 'old' }],
      version: 1,
      documentType: 'social_post',
      metadata: {
        retained: 'yes',
        writerOutput: { sourceLedger: { ledgerVersion: 1, entries: [{ referenceId: 'brief_user' }] } },
      },
    };
    mocks.getScript.mockResolvedValueOnce(stored);
    mocks.postRun.mockResolvedValue({ result: postResult() });

    await reviseDocumentViaFlatWriter({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      scriptId: 'post_1',
      existingScript: stored,
      existingContent: stored.content,
      instruction: 'Make the CTA more direct.',
      baseVersion: 1,
    });

    expect(mocks.resolveAuthoringContext).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      orgId: 'org_1',
      sessionProjectMeta: authoringContext.projectMeta,
      currentPrompt: 'Make the CTA more direct.',
      currentScript: stored.content,
      writingKnowledgeVersion: 'writing-v4',
    }));
    expect(mocks.postRun).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_b',
      project: authoringContext.projectMeta,
      retrievedContext: authoringContext.retrievedContext,
      contentSignalProfile: signalProfile,
      productionBrief,
      sourceLedger,
      context: expect.objectContaining({
        projectSummary: 'Approval ownership',
        systemBrief: expect.stringContaining('Canonical Brand B voice and kill-list.'),
      }),
    }));
    expect(mocks.buildSourceLedger).toHaveBeenCalledWith(expect.objectContaining({
      projectSummary: 'Approval ownership',
      previousLedger: stored.metadata.writerOutput.sourceLedger,
    }));
    expect(mocks.scriptRun).not.toHaveBeenCalled();
    expect(mocks.applyCommand).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        documentType: 'social_post',
        metadata: expect.objectContaining({
          retained: 'yes',
          workflow: 'edit',
          authoringContextSnapshot: authoringContext.snapshot,
          signalTrace: expect.objectContaining({ version: 1 }),
          briefSnapshot: productionBrief,
          writerOutput: expect.objectContaining({ writerType: 'post', sourceLedger }),
        }),
      }),
    }), 'user_1', 'org_1');
  });

  it('sends the same resolved authority, brief, and ledger to script edits', async () => {
    const stored = {
      sessionId: 'session_1',
      scriptId: 'script_1',
      title: 'Launch script',
      content: '## Scene 1: Old\n**Narration:** Old narration.\n**Visual:** Old visual.',
      blocks: [{ id: 'old' }],
      version: 3,
      documentType: 'video_script',
      metadata: {},
    };
    mocks.getScript.mockResolvedValueOnce(stored);
    mocks.scriptRun.mockResolvedValue({ result: scriptResult() });

    await reviseDocumentViaFlatWriter({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      scriptId: 'script_1',
      existingScript: stored,
      existingContent: stored.content,
      instruction: 'Make the opening more concrete.',
      baseVersion: 3,
    });

    expect(mocks.scriptRun).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_b',
      productionBrief,
      sourceLedger,
      retrievedContext: authoringContext.retrievedContext,
      context: expect.objectContaining({
        systemBrief: expect.stringContaining('<content_signal_profile>resolved</content_signal_profile>'),
      }),
    }));
    expect(mocks.applyCommand).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        metadata: expect.objectContaining({
          writerOutput: expect.objectContaining({
            writerType: 'script',
            sourceLedger,
          }),
        }),
      }),
    }), 'user_1', 'org_1');
  });

  it('fails before generation when the session or brand authority cannot be resolved', async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    await expect(reviseDocumentViaFlatWriter({
      userId: 'user_1',
      sessionId: 'missing',
      scriptId: 'missing_document',
      existingScript: null,
      existingContent: 'Existing content long enough to edit safely.',
      instruction: 'Rewrite this.',
      baseVersion: 0,
    })).rejects.toThrow(/not found or not authorized/i);

    mocks.getSession.mockResolvedValueOnce({
      _id: 'session_1',
      userId: 'user_1',
      projectMeta: authoringContext.projectMeta,
    });
    mocks.getScript.mockResolvedValueOnce({
      sessionId: 'session_1',
      scriptId: 'post_1',
      title: 'Canonical post',
      content: 'Canonical persisted content.',
      blocks: [{ id: 'canonical_block' }],
      version: 4,
      documentType: 'social_post',
      metadata: {},
    });
    mocks.resolveAuthoringContext.mockRejectedValueOnce(new Error('brand_profile_unavailable'));
    await expect(reviseDocumentViaFlatWriter({
      userId: 'user_1',
      sessionId: 'session_1',
      scriptId: 'post_1',
      existingScript: null,
      existingContent: 'Existing content long enough to edit safely.',
      instruction: 'Rewrite this.',
      baseVersion: 0,
    })).rejects.toThrow('brand_profile_unavailable');

    expect(mocks.postRun).not.toHaveBeenCalled();
    expect(mocks.scriptRun).not.toHaveBeenCalled();
    expect(mocks.applyCommand).not.toHaveBeenCalled();
  });
});
