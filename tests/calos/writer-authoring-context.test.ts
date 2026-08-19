import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildThinkForgeWriterInvocationTrace } from '@/lib/thinkforge/provenance/generation-trace';
import type { SourceLedger } from '@/lib/thinkforge/provenance/source-ledger';

const mocks = vi.hoisted(() => ({
  resolveCalosWriterExecutionContext: vi.fn(),
  postRunStructured: vi.fn(),
  scriptRunStructured: vi.fn(),
}));

vi.mock('@/lib/calos/generate/generators/_brand-brief', () => ({
  resolveCalosWriterExecutionContext: mocks.resolveCalosWriterExecutionContext,
}));
vi.mock('@/lib/thinkforge/agents/post-writer-agent', () => ({
  PostWriterAgent: function PostWriterAgent() {
    return { runStructured: mocks.postRunStructured };
  },
}));
vi.mock('@/lib/thinkforge/agents/script-writer-agent', () => ({
  ScriptWriterAgent: function ScriptWriterAgent() {
    return { runStructured: mocks.scriptRunStructured };
  },
}));

const params = {
  ownerUserId: 'user_1',
  orgId: 'org_1',
  brandId: 'brand_b',
  campaignId: 'campaign_1',
  deliverableId: 'deliverable_1',
  format: 'text',
  platform: 'linkedin',
  title: 'A grounded launch idea',
  angle: 'Show the actual customer workflow.',
};

const sourceLedger: SourceLedger = {
  ledgerVersion: 1,
  entries: [{
    referenceId: 'source_1',
    kind: 'project_fact',
    title: 'Launch date',
    summary: 'Launch is on Friday.',
    sourceId: 'calos_campaign_launch',
    confidence: 0.95,
    provenance: { origin: 'project_fact', brandId: 'brand_b' },
  }],
};
const postAuthoringRequest = {
  version: 1,
  contentContract: {
    version: 1,
    documentKind: 'post',
    outputKind: 'social_post',
    artifactType: 'social_post',
  },
  platformSurface: { id: 'linkedin' },
  postControls: {
    version: 1,
    cta: { preference: 'editorial' },
    hashtags: { preference: 'editorial' },
    emoji: { preference: 'editorial' },
  },
} as const;
const scriptAuthoringRequest = {
  version: 1,
  contentContract: {
    version: 1,
    documentKind: 'script',
    outputKind: 'video_script',
    artifactType: 'screenplay',
  },
  platformSurface: { id: 'youtube' },
  targetDurationSec: 420,
} as const;
const postProductionBrief = {
  output: { platform: 'linkedin' },
};
const scriptProductionBrief = {
  output: { platform: 'youtube', targetDurationSec: 420 },
};
const postEditorialPlan = {
  version: 2,
  writerKind: 'post',
  execution: { kind: 'post' },
};
const scriptEditorialPlan = {
  version: 2,
  writerKind: 'script',
  execution: { kind: 'script' },
};
const postWriterTrace = buildThinkForgeWriterInvocationTrace({
  writerType: 'post',
  editorialPlan: postEditorialPlan,
  selectedTechniques: [],
  promptTemplate: 'post prompt',
  sourceLedger,
  provider: 'gemini',
  model: 'gemini-test',
  cacheStatus: 'inline',
  generatedAt: '2026-08-19T00:00:00.000Z',
});
const scriptWriterTrace = buildThinkForgeWriterInvocationTrace({
  writerType: 'script',
  editorialPlan: scriptEditorialPlan,
  selectedTechniques: [],
  promptTemplate: 'script prompt',
  sourceLedger,
  provider: 'gemini',
  model: 'gemini-test',
  cacheStatus: 'inline',
  generatedAt: '2026-08-19T00:00:00.000Z',
});
const writerContext = {
  projectMeta: {
    brandId: 'brand_b',
    title: 'A grounded launch idea',
    campaignId: 'campaign_1',
    contentCardId: 'deliverable_1',
    authoringRequest: postAuthoringRequest,
  },
  systemBrief: 'Accepted Brand Vault revision plus resolved content signals.',
  retrievedContext: {
    brandDNA: { killList: ['synergy'] },
    projectFacts: [{ id: 'calos_campaign_launch', title: 'Launch date', summary: 'Launch is on Friday.', tags: [] }],
    globalFacts: [],
    semanticFacts: [],
    interactionPatterns: [],
  },
  snapshot: { version: 2 },
  contentSignalProfile: { profile: { signals: {}, constraints: {}, derived: {} } },
  signalTrace: { version: 1 },
};
const execution = {
  authoringContext: writerContext,
  route: {
    format: 'text',
    service: 'thinkforge',
    writerKind: 'social_post',
    documentType: 'social_post',
    contentContract: { version: 1, documentKind: 'post', outputKind: 'social_post', artifactType: 'social_post' },
  },
  userPrompt: 'A grounded launch idea\nBrief: Show the actual customer workflow.\nFormat: text\nPlatform: linkedin',
  authoringRequest: postAuthoringRequest,
  sourceLedger,
  productionBrief: postProductionBrief,
  editorialPlan: postEditorialPlan,
};
const postResult = {
  content: 'A complete **platform** post.',
  hashtags: ['#Launch'],
  contentAnalysis: {
    tone: 'Precise',
    vibe: 'Grounded',
    theme: 'Launch',
    qualityScore: 95,
    violations: [],
  },
  clickatron: { singleImagePrompt: 'A real product workflow in natural light.' },
  metadata: { platform: 'linkedin', charCount: 25 },
};
const scriptResult = {
  content: 'A complete seven-minute video script.',
  contentAnalysis: { hooks: [], theme: 'Launch', emphasisPoints: [], qualityScore: 95 },
  visualMetadata: { motionInfo: 'restrained', scenePrompts: ['A grounded launch scene'] },
  metadata: { platform: 'youtube', estimatedTimeSeconds: 420, voiceLanguages: ['en'] },
  sidecar: { sidecarVersion: 2 },
};

describe('CalOS canonical ThinkForge writer inputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCalosWriterExecutionContext.mockResolvedValue(execution);
    mocks.postRunStructured.mockResolvedValue({ result: postResult, metadata: { writerTrace: postWriterTrace } });
    mocks.scriptRunStructured.mockResolvedValue({ result: scriptResult, metadata: { writerTrace: scriptWriterTrace } });
  });

  it('passes one resolved ledger, brief, signal profile, and contract to PostWriter', async () => {
    const { runPostWriter } = await import('@/lib/calos/generate/generators/_post-writer');

    const output = await runPostWriter(params);

    expect(output).toMatchObject({
      content: 'A complete platform post.',
      imagePrompt: 'A real product workflow in natural light.',
      result: postResult,
      writerTrace: postWriterTrace,
      sourceLedger,
      productionBrief: postProductionBrief,
    });
    expect(mocks.resolveCalosWriterExecutionContext).toHaveBeenCalledWith(params);
    expect(mocks.postRunStructured).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_b',
      project: writerContext.projectMeta,
      retrievedContext: writerContext.retrievedContext,
      contentSignalProfile: writerContext.contentSignalProfile,
      productionBrief: postProductionBrief,
      sourceLedger,
      editorialPlan: postEditorialPlan,
      userPrompt: execution.userPrompt,
      authoringRequest: postAuthoringRequest,
    }));
    expect(execution.userPrompt).not.toContain('<reference_material>');
  });

  it('passes exact runtime and provenance to ScriptWriter and preserves its full result', async () => {
    const { runScriptWriter, runScriptWriterExecution } = await import('@/lib/calos/generate/generators/_script-writer');
    const scriptParams = { ...params, format: 'long_video', targetDurationSeconds: 420 };
    const scriptExecution = {
      ...execution,
      authoringContext: {
        ...writerContext,
        projectMeta: {
          ...writerContext.projectMeta,
          platform: 'YouTube',
          format: '7-minute YouTube video script',
          durationSec: 420,
          contentContract: scriptAuthoringRequest.contentContract,
          authoringRequest: scriptAuthoringRequest,
        },
      },
      authoringRequest: scriptAuthoringRequest,
      route: {
        format: 'long_video',
        service: 'thinkforge',
        writerKind: 'video_script',
        documentType: 'video_script',
        contentContract: scriptAuthoringRequest.contentContract,
      },
      userPrompt: 'A grounded launch idea\nBrief: Show the actual customer workflow.\nFormat: long_video\nPlatform: youtube',
      productionBrief: scriptProductionBrief,
      editorialPlan: scriptEditorialPlan,
    };
    mocks.resolveCalosWriterExecutionContext.mockResolvedValue(scriptExecution);

    await expect(runScriptWriter(scriptParams)).resolves.toBe('A complete seven-minute video script.');
    await expect(runScriptWriterExecution(scriptParams)).resolves.toMatchObject({
      content: 'A complete seven-minute video script.',
      result: scriptResult,
      writerTrace: scriptWriterTrace,
      sourceLedger,
      productionBrief: scriptProductionBrief,
    });
    expect(mocks.scriptRunStructured).toHaveBeenCalledWith(expect.objectContaining({
      contentSignalProfile: writerContext.contentSignalProfile,
      productionBrief: scriptProductionBrief,
      sourceLedger,
      editorialPlan: scriptEditorialPlan,
      userPrompt: scriptExecution.userPrompt,
      authoringRequest: scriptAuthoringRequest,
    }));
  });

  it('does not invoke a writer when canonical execution context resolution fails', async () => {
    mocks.resolveCalosWriterExecutionContext.mockRejectedValueOnce(
      new Error('Brand Vault profile is unavailable.'),
    );
    const { runPostWriter } = await import('@/lib/calos/generate/generators/_post-writer');

    await expect(runPostWriter(params)).rejects.toThrow('Brand Vault profile is unavailable.');
    expect(mocks.postRunStructured).not.toHaveBeenCalled();
  });

  it('fails closed when writer evidence does not match the executed plan', async () => {
    mocks.postRunStructured.mockResolvedValueOnce({
      result: postResult,
      metadata: {
        writerTrace: {
          ...postWriterTrace,
          editorialPlanHash: '0'.repeat(64),
        },
      },
    });
    const { runPostWriter } = await import('@/lib/calos/generate/generators/_post-writer');

    await expect(runPostWriter(params)).rejects.toThrow('does not match the executed editorial plan');
  });
});
