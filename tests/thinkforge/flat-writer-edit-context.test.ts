import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import { buildThinkForgeIdeaAngle } from '@/lib/thinkforge/schemas/idea-angle';
import { hashThinkForgeTraceValue } from '@/lib/thinkforge/provenance/generation-trace';
import { serializeThinkForgeBlocksToMarkdown } from '@/lib/thinkforge/canonical-document-state';
import { thinkForgeBlocksToTiptapJSON } from '@/lib/thinkforge/mappers/thinkforge-to-tiptap';
import { parseMarkdownToBlocks } from '@/lib/thinkforge/normalization/markdown-parser';
import {
  abstractExplainerTreatment,
  mixedPresenterCutawayTreatment,
} from '@/tests/fixtures/thinkforge-video-treatment';

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
  getWritingKnowledgeIdentity: vi.fn(),
  getWritingKnowledgeVersion: vi.fn(),
  postRun: vi.fn(),
  planVideoTreatment: vi.fn(),
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

vi.mock('@/lib/thinkforge/data/writing-graph-query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/thinkforge/data/writing-graph-query')>(),
  getWritingKnowledgeIdentity: mocks.getWritingKnowledgeIdentity,
  getVersion: mocks.getWritingKnowledgeVersion,
}));

vi.mock('@/lib/thinkforge/brief/resolve-production-brief', () => ({
  resolveThinkForgeProductionBrief: mocks.resolveProductionBrief,
}));

vi.mock('@/lib/thinkforge/video-treatment/treatment-planner', () => ({
  planVideoTreatment: mocks.planVideoTreatment,
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

import {
  planProductionContractRefresh,
  reviseDocumentViaFlatWriter,
} from '@/lib/thinkforge/services/flat-writer-edit';

const signalProfile = {
  profile: { constraints: {}, signals: {}, derived: {}, _inference_metadata: {} },
  intent: {
    goal: 'education',
    outputFormat: 'social_post',
    proofPoints: [],
    forbiddenTerms: [],
  },
  sources: {},
  warnings: [],
};

const sourceLedger = {
  ledgerVersion: 1,
  entries: [
    {
      referenceId: 'brief_user',
      kind: 'user_brief',
      title: 'Current edit instruction',
      summary: 'Make the approved draft more concrete.',
      confidence: 1,
      provenance: { origin: 'user_prompt', brandId: 'brand_b', sessionId: 'session_1' },
    },
    {
      referenceId: 'source_current',
      kind: 'project_fact',
      title: 'Current approval fact',
      summary: 'Every launch has one named approval owner.',
      sourceId: 'fact_project_current',
      confidence: 0.95,
      provenance: { origin: 'project_fact', brandId: 'brand_b', sessionId: 'session_1' },
    },
  ],
};
const HASH = 'a'.repeat(64);

function writerTrace(
  writerType: 'post' | 'script',
  editorialPlan: Record<string, unknown> = { format: writerType },
) {
  return {
    version: 1,
    writerType,
    generatedAt: '2026-08-16T00:00:00.000Z',
    editorialPlan,
    editorialPlanHash: hashThinkForgeTraceValue(editorialPlan),
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
    retrieval: {
      projectFactIds: ['fact_project_current'],
      globalFactIds: ['fact_global_current'],
      interactionPatternTypes: [],
    },
    writingKnowledgeVersion: 'writing-v4',
  },
};

const selectedAngle = buildThinkForgeIdeaAngle({
  ideaId: 'idea_approval_ownership',
  title: 'The Invisible Approval Queue',
  strategicPurpose: 'Show operators why unnamed approval ownership delays every launch.',
  creativeTreatment: 'Follow one launch card through a visible chain of handoffs.',
});

const selectedAngleAuthoringContext = {
  ...authoringContext,
  projectMeta: {
    ...authoringContext.projectMeta,
    idea: selectedAngle.title,
    purpose: selectedAngle.strategicPurpose,
    style: selectedAngle.creativeTreatment,
    editorialAngle: selectedAngle,
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
    mocks.getWritingKnowledgeIdentity.mockReturnValue({
      version: 'writing-v4',
      source: 'creative-content-knowledge.md',
    });
    mocks.getWritingKnowledgeVersion.mockReturnValue('writing-v4');
    mocks.resolveSignalProfile.mockReturnValue(signalProfile);
    mocks.evaluateCompliance.mockReturnValue({ score: 100, penalty: 0, violations: [] });
    mocks.formatCompliance.mockReturnValue([]);
    mocks.shouldAutoRepairCompliance.mockReturnValue(false);
    mocks.formatSignalProfile.mockReturnValue('<content_signal_profile>resolved</content_signal_profile>');
    mocks.buildSignalTrace.mockReturnValue({ version: 1, selectedIntent: { outputFormat: 'social_post' } });
    mocks.resolveProductionBrief.mockReturnValue(productionBrief);
    mocks.buildSourceLedger.mockReturnValue(sourceLedger);
    mocks.planVideoTreatment.mockResolvedValue({
      treatment: abstractExplainerTreatment,
      inputFingerprint: abstractExplainerTreatment.decisionTrace.inputFingerprint,
      source: 'generated',
      cacheStatus: 'miss',
      modelName: 'gemini-test',
      latencyMs: 120,
      writingContextCacheStatus: 'hit',
      knowledge: {
        writingKnowledge: { version: 'writing-v4' },
        editronGraph: { version: 'editron-v3' },
      },
    });
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
    mocks.getSession.mockResolvedValueOnce({
      _id: 'session_1',
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: selectedAngleAuthoringContext.projectMeta,
    });
    mocks.getScript.mockResolvedValueOnce(stored);
    mocks.resolveAuthoringContext.mockResolvedValueOnce(selectedAngleAuthoringContext);
    mocks.postRun.mockImplementation(async (input) => ({
      result: postResult(),
      metadata: { writerTrace: writerTrace('post', input.editorialPlan) },
    }));

    await reviseDocumentViaFlatWriter({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      scriptId: 'post_1',
      instruction: 'Make the CTA more direct.',
    });

    expect(mocks.resolveAuthoringContext).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      orgId: 'org_1',
      sessionProjectMeta: selectedAngleAuthoringContext.projectMeta,
      currentPrompt: 'Make the CTA more direct.',
      currentScript: stored.content,
      writingKnowledgeVersion: 'writing-v4',
    }));
    expect(mocks.postRun).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_b',
      authoringRequest: postAuthoringRequest,
      project: selectedAngleAuthoringContext.projectMeta,
      retrievedContext: authoringContext.retrievedContext,
      contentSignalProfile: signalProfile,
      productionBrief,
      sourceLedger,
      editorialPlan: expect.objectContaining({
        version: 2,
        writerKind: 'post',
        creativeIntent: {
          source: 'selected_angle',
          selectedAngle,
          overridePolicy: 'explicit_current_instruction_only',
        },
        evidence: expect.objectContaining({
          authorizedFactIds: ['fact_project_current', 'fact_global_current'],
          sourceLedgerEntryIds: ['brief_user', 'source_current'],
        }),
      }),
      context: expect.objectContaining({
        projectSummary: selectedAngle.title,
        systemBrief: expect.stringContaining('Canonical Brand B voice and kill-list.'),
      }),
    }));
    expect(mocks.buildSourceLedger).toHaveBeenCalledWith(expect.objectContaining({
      projectSummary: selectedAngle.title,
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
    expect(mocks.planVideoTreatment).not.toHaveBeenCalled();
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
              writer: expect.objectContaining({
                editorialPlan: expect.objectContaining({
                  version: 2,
                  writerKind: 'post',
                  creativeIntent: expect.objectContaining({ selectedAngle }),
                }),
              }),
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
      metadata: {
        writerOutput: {
          sourceLedger,
          videoTreatment: mixedPresenterCutawayTreatment,
        },
      },
    };
    mocks.getSession.mockResolvedValueOnce({
      _id: 'session_1',
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: scriptAuthoringContext.projectMeta,
    });
    mocks.getScript.mockResolvedValueOnce(stored);
    mocks.resolveAuthoringContext.mockResolvedValueOnce(scriptAuthoringContext);
    mocks.scriptRun.mockImplementation(async (input) => ({
      result: scriptResult(),
      metadata: { writerTrace: writerTrace('script', input.editorialPlan) },
    }));

    await reviseDocumentViaFlatWriter({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      scriptId: 'script_1',
      instruction: 'Make the opening more concrete.',
    });

    expect(mocks.planVideoTreatment).toHaveBeenCalledWith(expect.objectContaining({
      userPrompt: 'Make the opening more concrete.',
      authoringRequest: scriptAuthoringRequest,
      productionBrief,
      sourceLedger,
      editContext: {
        currentContent: stored.content,
        instruction: 'Make the opening more concrete.',
        existingTreatment: mixedPresenterCutawayTreatment,
      },
    }));
    expect(mocks.scriptRun).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_b',
      authoringRequest: scriptAuthoringRequest,
      productionBrief,
      sourceLedger,
      videoTreatment: abstractExplainerTreatment,
      editorialPlan: expect.objectContaining({
        version: 2,
        writerKind: 'script',
        creativeIntent: {
          source: 'direct_brief',
          overridePolicy: 'current_instruction',
        },
        resolvedProduction: { targetDurationSec: 420 },
        evidence: expect.objectContaining({
          authorizedFactIds: ['fact_project_current', 'fact_global_current'],
          sourceLedgerEntryIds: ['brief_user', 'source_current'],
        }),
      }),
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
            videoTreatment: abstractExplainerTreatment,
            videoTreatmentPlanning: {
              version: 1,
              inputFingerprint: abstractExplainerTreatment.decisionTrace.inputFingerprint,
              treatmentId: abstractExplainerTreatment.treatmentId,
              source: 'generated',
              cacheStatus: 'miss',
              modelName: 'gemini-test',
              latencyMs: 120,
              writingKnowledgeVersion: 'writing-v4',
              editronCreativeGraphVersion: 'editron-v3',
              writingContextCacheStatus: 'hit',
            },
            generationTrace: expect.objectContaining({
              operation: { kind: 'edit', id: 'edit:session_1:script_1:v4' },
              document: expect.objectContaining({ expectedVersion: 4, writerType: 'script' }),
              writer: expect.objectContaining({
                editorialPlan: expect.objectContaining({
                  version: 2,
                  writerKind: 'script',
                  resolvedProduction: { targetDurationSec: 420 },
                }),
              }),
            }),
          }),
        }),
      }),
    }), 'user_1', 'org_1');
  });

  it('refreshes a production contract without changing any canonical document content', async () => {
    const scriptAuthoringContext = {
      ...authoringContext,
      projectMeta: {
        ...authoringContext.projectMeta,
        platform: 'youtube',
        authoringRequest: scriptAuthoringRequest,
        contentContract: scriptAuthoringRequest.contentContract,
      },
    };
    const exactBlocks = [
      ...parseMarkdownToBlocks(scriptResult().content),
      {
        id: 'manual_closing',
        kind: 'paragraph' as const,
        content: [{ type: 'text' as const, text: 'QA-MANUAL-REFRESH-2026', styles: {} }],
      },
    ];
    const exactContent = serializeThinkForgeBlocksToMarkdown(exactBlocks);
    const stored = {
      sessionId: 'session_1',
      scriptId: 'script_refresh',
      title: 'Manually edited script',
      content: exactContent,
      blocks: exactBlocks,
      richText: thinkForgeBlocksToTiptapJSON(exactBlocks),
      version: 6,
      documentType: 'video_script',
      contentContract: scriptAuthoringRequest.contentContract,
      metadata: {
        writerOutput: {
          sourceLedger,
          videoTreatment: mixedPresenterCutawayTreatment,
        },
      },
    };
    mocks.getSession.mockResolvedValue({
      _id: 'session_1',
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: scriptAuthoringContext.projectMeta,
    });
    mocks.getScript.mockResolvedValue(stored);
    mocks.resolveAuthoringContext.mockResolvedValue(scriptAuthoringContext);
    mocks.scriptRun.mockImplementation(async (input) => ({
      result: scriptResult(),
      metadata: { writerTrace: writerTrace('script', input.editorialPlan) },
    }));

    const productionContractPlan = await planProductionContractRefresh({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      scriptId: 'script_refresh',
      expectedVersion: 6,
    });
    await reviseDocumentViaFlatWriter({
      mode: 'refresh-production-contract',
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      scriptId: 'script_refresh',
      expectedVersion: 6,
      productionContractPlan,
    });

    expect(mocks.scriptRun).toHaveBeenCalledWith(expect.objectContaining({
      videoTreatment: abstractExplainerTreatment,
      editContext: expect.objectContaining({
        existingContent: exactContent,
        focusHint: expect.stringContaining('exactly'),
      }),
    }));
    expect(mocks.planVideoTreatment).toHaveBeenCalledTimes(1);
    expect(mocks.applyCommand).toHaveBeenCalledWith(expect.objectContaining({
      baseVersion: 6,
      payload: expect.objectContaining({
        title: stored.title,
        content: exactContent,
        metadata: expect.objectContaining({
          workflow: 'production-contract-refresh',
          writerOutput: expect.objectContaining({
            sidecarVersion: 1,
            videoTreatment: abstractExplainerTreatment,
          }),
        }),
      }),
    }), 'user_1', 'org_1');
  });

  it('rejects a production-contract refresh if the writer changes visible spoken prose', async () => {
    const exactContent = scriptResult().content;
    mocks.getSession.mockResolvedValueOnce({
      _id: 'session_1',
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: {
        ...authoringContext.projectMeta,
        platform: 'youtube',
        authoringRequest: scriptAuthoringRequest,
        contentContract: scriptAuthoringRequest.contentContract,
      },
    });
    mocks.getScript.mockResolvedValueOnce({
      sessionId: 'session_1',
      scriptId: 'script_refresh',
      title: 'Manually edited script',
      content: exactContent,
      version: 6,
      documentType: 'video_script',
      contentContract: scriptAuthoringRequest.contentContract,
      metadata: { writerOutput: { sourceLedger, videoTreatment: mixedPresenterCutawayTreatment } },
    });
    mocks.resolveAuthoringContext.mockResolvedValueOnce({
      ...authoringContext,
      projectMeta: {
        ...authoringContext.projectMeta,
        platform: 'youtube',
        authoringRequest: scriptAuthoringRequest,
        contentContract: scriptAuthoringRequest.contentContract,
      },
    });
    mocks.scriptRun.mockResolvedValueOnce({
      result: {
        ...scriptResult(),
        content: scriptResult().content.replace(
          'Name one owner before launch.',
          'Name several owners after launch.',
        ),
      },
      metadata: { writerTrace: writerTrace('script') },
    });

    await expect(reviseDocumentViaFlatWriter({
      mode: 'refresh-production-contract',
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      scriptId: 'script_refresh',
      expectedVersion: 6,
    })).rejects.toThrow(/changed visible spoken content/i);
    expect(mocks.applyCommand).not.toHaveBeenCalled();
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
      instruction: 'Rewrite this.',
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
      instruction: 'Rewrite this.',
    })).rejects.toThrow('brand_profile_unavailable');

    expect(mocks.postRun).not.toHaveBeenCalled();
    expect(mocks.scriptRun).not.toHaveBeenCalled();
    expect(mocks.applyCommand).not.toHaveBeenCalled();
  });
});
