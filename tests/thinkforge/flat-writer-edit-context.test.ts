import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import { hashThinkForgeTraceValue } from '@/lib/thinkforge/provenance/generation-trace';

const mocks = vi.hoisted(() => ({
  applyCommand: vi.fn(),
  assertNoCriticalCompliance: vi.fn(),
  buildSourceLedger: vi.fn(),
  buildSignalTrace: vi.fn(),
  evaluateCompliance: vi.fn(),
  formatCompliance: vi.fn(),
  formatSignalProfile: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  getWritingKnowledgeVersion: vi.fn(),
  postRun: vi.fn(),
  resolveAuthoringContext: vi.fn(),
  resolveProductionBrief: vi.fn(),
  resolveSignalProfile: vi.fn(),
  scriptRun: vi.fn(),
  shouldAutoRepairCompliance: vi.fn(),
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
  assertNoCriticalContentProfileViolations: mocks.assertNoCriticalCompliance,
  buildThinkForgeSignalTrace: mocks.buildSignalTrace,
  evaluateContentProfileCompliance: mocks.evaluateCompliance,
  formatContentProfileComplianceViolations: mocks.formatCompliance,
  formatContentSignalProfileForPrompt: mocks.formatSignalProfile,
  resolveContentSignalProfile: mocks.resolveSignalProfile,
  shouldAutoRepairContentProfileViolations: mocks.shouldAutoRepairCompliance,
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
const HASH = 'a'.repeat(64);

function writerTrace(writerType: 'post' | 'script') {
  return {
    version: 1,
    writerType,
    generatedAt: '2026-08-16T00:00:00.000Z',
    editorialPlan: { format: writerType },
    editorialPlanHash: HASH,
    selectedTechniqueIds: [],
    techniqueEvidence: [],
    writingKnowledge: {
      version: 'writing-v4',
      source: 'creative-content-knowledge.md',
      contentHash: HASH,
    },
    promptTemplateHash: HASH,
    sourceLedgerHash: hashThinkForgeTraceValue(sourceLedger),
    provider: {
      provider: 'gemini',
      model: 'models/gemini-2.5-flash',
      cacheStatus: 'hit',
    },
    repair: { applied: false, failureCodes: [] },
  };
}
const productionBrief = {
  output: { platform: 'linkedin', count: 1, format: 'auto-edit' },
  resolution: { fieldConfidence: {}, confirmed: [], inferred: [] },
  entryPoint: 'thinkforge',
  brand: { brandId: 'brand_b' },
};

const postAuthoringRequest = createThinkForgeAuthoringRequest({
  contentContract: createThinkForgeWriterContract('social_post'),
  platformSurface: { id: 'linkedin' },
  postControls: createDefaultThinkForgePostControls(),
});

const scriptAuthoringRequest = createThinkForgeAuthoringRequest({
  contentContract: createThinkForgeWriterContract('video_script'),
  platformSurface: { id: 'youtube' },
  targetDurationSec: 420,
});

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
    authoringRequest: postAuthoringRequest,
    contentContract: postAuthoringRequest.contentContract,
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
    mocks.evaluateCompliance.mockReturnValue({ score: 100, penalty: 0, violations: [] });
    mocks.formatCompliance.mockReturnValue([]);
    mocks.shouldAutoRepairCompliance.mockReturnValue(false);
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
      contentContract: postAuthoringRequest.contentContract,
      metadata: {
        retained: 'yes',
        writerOutput: { sourceLedger: { ledgerVersion: 1, entries: [{ referenceId: 'brief_user' }] } },
      },
    };
    mocks.getScript.mockResolvedValueOnce(stored);
    mocks.postRun.mockResolvedValue({
      result: postResult(),
      metadata: { writerTrace: writerTrace('post') },
    });

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
      authoringRequest: postAuthoringRequest,
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
    expect(mocks.resolveSignalProfile).toHaveBeenCalledWith(expect.objectContaining({
      authoringRequest: postAuthoringRequest,
      contentContract: postAuthoringRequest.contentContract,
    }));
    expect(mocks.resolveProductionBrief).toHaveBeenCalledWith(expect.objectContaining({
      authoringRequest: postAuthoringRequest,
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
          writerOutput: expect.objectContaining({
            writerType: 'post',
            sourceLedger,
            profileCompliance: expect.objectContaining({ score: 100, hasCritical: false }),
            generationTrace: expect.objectContaining({
              operation: { kind: 'edit', id: 'edit:session_1:post_1:v2' },
              document: expect.objectContaining({ expectedVersion: 2, writerType: 'post' }),
            }),
          }),
        }),
      }),
    }), 'user_1', 'org_1');
  });

  it('sends the same resolved authority, brief, and ledger to script edits', async () => {
    const scriptAuthoringContext = {
      ...authoringContext,
      projectMeta: {
        ...authoringContext.projectMeta,
        format: '7-minute YouTube video script',
        platform: 'youtube',
        authoringRequest: scriptAuthoringRequest,
        contentContract: scriptAuthoringRequest.contentContract,
      },
    };
    const stored = {
      sessionId: 'session_1',
      scriptId: 'script_1',
      title: 'Launch script',
      content: '## Scene 1: Old\n**Narration:** Old narration.\n**Visual:** Old visual.',
      blocks: [{ id: 'old' }],
      version: 3,
      documentType: 'video_script',
      contentContract: scriptAuthoringRequest.contentContract,
      metadata: {},
    };
    mocks.getSession.mockResolvedValueOnce({
      _id: 'session_1',
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: scriptAuthoringContext.projectMeta,
    });
    mocks.getScript.mockResolvedValueOnce(stored);
    mocks.resolveAuthoringContext.mockResolvedValueOnce(scriptAuthoringContext);
    mocks.scriptRun.mockResolvedValue({
      result: scriptResult(),
      metadata: { writerTrace: writerTrace('script') },
    });

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
      authoringRequest: scriptAuthoringRequest,
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
            generationTrace: expect.objectContaining({
              operation: { kind: 'edit', id: 'edit:session_1:script_1:v4' },
              document: expect.objectContaining({ expectedVersion: 4, writerType: 'script' }),
            }),
          }),
        }),
      }),
    }), 'user_1', 'org_1');
  });

  it('fails before generation when the persisted authoring request is missing', async () => {
    const legacyProjectMeta = {
      ...authoringContext.projectMeta,
      authoringRequest: undefined,
    };
    mocks.resolveAuthoringContext.mockResolvedValueOnce({
      ...authoringContext,
      projectMeta: legacyProjectMeta,
    });
    mocks.getScript.mockResolvedValueOnce({
      sessionId: 'session_1',
      scriptId: 'post_legacy',
      title: 'Legacy post',
      content: 'Legacy content that must not be edited from guessed controls.',
      blocks: [{ id: 'legacy' }],
      version: 2,
      documentType: 'social_post',
      contentContract: postAuthoringRequest.contentContract,
      metadata: {},
    });

    await expect(reviseDocumentViaFlatWriter({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      scriptId: 'post_legacy',
      instruction: 'Rewrite this post.',
    })).rejects.toThrow(/requires a persisted authoring request/i);

    expect(mocks.postRun).not.toHaveBeenCalled();
    expect(mocks.scriptRun).not.toHaveBeenCalled();
    expect(mocks.applyCommand).not.toHaveBeenCalled();
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
      contentContract: postAuthoringRequest.contentContract,
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
