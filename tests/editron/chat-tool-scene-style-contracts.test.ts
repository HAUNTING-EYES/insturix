import { readFileSync } from 'node:fs';
import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  applyGroundedEditorialIntent: vi.fn(),
  extractEditDNA: vi.fn(),
  getStoryboard: vi.fn(),
  getStoryboardByProjectId: vi.fn(),
  getStoryboardForProjectContext: vi.fn(),
  loadProfile: vi.fn(),
  queueReferenceStyleJob: vi.fn(),
  regenerateStoryboardSceneImage: vi.fn(),
}));

const agentFixture = vi.hoisted(() => ({
  modelStep: 0,
  genericIntentExecutions: 0,
  project: {} as Record<string, unknown>,
}));

vi.hoisted(() => {
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/editron-test';
  process.env.MONGODB_DB_NAME ??= 'editron-test';
  process.env.VERCEL_URL = 'preview.example.test';
});

vi.mock('@google/generative-ai', () => ({
  SchemaType: { OBJECT: 'object' },
  GoogleGenerativeAI: class GoogleGenerativeAIFixture {
    getGenerativeModel() {
      return {
        async generateContentStream() {
          const step = agentFixture.modelStep++;
          const parts = step === 0 || step === 1 || step === 2
              ? [{
                  functionCall: {
                    name: 'apply_reference_style',
                    args: { referenceAssetId: 'asset-reference', strength: 0.7 },
                  },
                  thoughtSignature: `signed-apply-${step}`,
                }]
              : [{ text: 'Applied the warranted parts of the reference style once.' }];
          const chunk = { candidates: [{ content: { parts } }] };
          return {
            stream: {
              async *[Symbol.asyncIterator]() {
                yield chunk;
              },
            },
            response: Promise.resolve({
              candidates: [{
                content: {
                  parts: parts.map((part) => 'functionCall' in part
                    ? { functionCall: part.functionCall }
                    : part),
                },
              }],
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 5,
                totalTokenCount: 15,
              },
            }),
          };
        },
      };
    }
  },
}));

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
    resolveAssetUrl: vi.fn(async () => 'https://cdn.example.com/resolved.mp4'),
  },
}));

vi.mock('@/lib/pipeline/storyboard-db', () => ({
  getStoryboard: mocks.getStoryboard,
  getStoryboardByProjectId: mocks.getStoryboardByProjectId,
  getStoryboardForProjectContext: mocks.getStoryboardForProjectContext,
}));

vi.mock('@/lib/pipeline/storyboard-scene-regeneration', () => ({
  regenerateStoryboardSceneImage: mocks.regenerateStoryboardSceneImage,
}));

vi.mock('@/lib/editron/services/style-transfer-service', () => ({
  extractEditDNA: mocks.extractEditDNA,
  loadProfile: mocks.loadProfile,
}));

vi.mock('@/lib/editron/agent/chat-editorial-intent-tools', () => ({
  applyGroundedEditorialIntent: mocks.applyGroundedEditorialIntent,
  createChatEditorialIntentTools: () => [
    tool(
      async () => {
        agentFixture.genericIntentExecutions += 1;
        return JSON.stringify({ status: 'success', data: { mutated: true }, error: null });
      },
      {
        name: 'apply_editorial_intent',
        description: 'Apply generic editorial intent.',
        schema: z.object({ goal: z.string() }),
      },
    ),
    tool(
      async (input: { referenceAssetId: string; strength: number }) => {
        const result = await mocks.queueReferenceStyleJob(input);
        return JSON.stringify({
          status: 'success',
          data: result,
          error: null,
        });
      },
      {
        name: 'apply_reference_style',
        description: 'Queue the dedicated durable reference-style workflow.',
        schema: z.object({
          referenceAssetId: z.string(),
          strength: z.number().min(0).max(1),
        }),
      },
    ),
  ],
  filterChatShadowAuthorityTools: <T>(tools: T) => tools,
}));

import { createTools } from '@/lib/editron/agent/tools';
import { createAgent } from '@/lib/editron/agent/agent-graph';
import { enforceChatToolPostcondition } from '@/lib/editron/agent/chat-edit-postconditions';
import { projectService } from '@/lib/editron/services/project-service';
import {
  PIPELINE_VIDEO_ENQUEUE_INTERNAL_MAX_AGE_MS_V1,
  createPipelineVideoEnqueueInternalHeadersV1,
  verifyPipelineVideoEnqueueInternalRequestV1,
} from '@/lib/editron/security/pipeline-video-enqueue-internal-auth';
import { resolvePipelineVideoWorkerDispatchPolicyV1 } from '@/lib/pipeline/video-worker-dispatch-policy';

const BASE_PROJECT = {
  projectId: 'proj_scene_style',
  userId: 'user_scene_style',
  name: 'Scene and style fixture',
  aspectRatio: '16:9',
  playerDimensions: { width: 1280, height: 720 },
  fps: 30,
  durationInFrames: 600,
  overlays: [{ id: 1, type: 'video', assetId: 'asset-reference', from: 0, durationInFrames: 600 }],
  createdAt: new Date('2026-07-18T00:00:00.000Z'),
  updatedAt: new Date('2026-07-18T00:00:00.000Z'),
  visibility: 'private',
};

function toolNamed(name: string) {
  const candidate = createTools('user_scene_style', 'proj_scene_style')
    .find((tool) => tool.name === name);
  expect(candidate, `${name} should be registered`).toBeDefined();
  return candidate as unknown as { invoke: (input: Record<string, unknown>) => Promise<string> };
}

function parseEnvelope(raw: string) {
  return JSON.parse(raw) as {
    status: 'success' | 'advisory' | 'error';
    data: Record<string, any> | null;
    error: { code?: string; message: string } | null;
  };
}

function dnaFixture() {
  return {
    profileId: 'dna-reference-1',
    sourceName: 'Reference cut',
    cutRhythm: { avgCutsPerMinute: 18, pattern: 'steady', avgClipDuration: 3.3 },
    transitions: { dominant: 'hard_cut', frequency: 15 },
    colorGrade: { temperature: 'warm', saturation: 'normal', contrast: 'high', dominantColors: ['#151515'] },
    textStyle: { fontWeight: 'bold', position: 'lower_third', animation: 'fade', frequency: 'moderate' },
    musicStyle: { tempo: 'medium', genre: 'cinematic', energyLevel: 'low' },
    pacing: { overall: 'medium', hookSpeed: 'fast', mainSpeed: 'medium' },
    graphicsDensity: 'minimal',
  };
}

describe('chat scene and style tool contracts', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    agentFixture.modelStep = 0;
    agentFixture.genericIntentExecutions = 0;
    agentFixture.project = structuredClone(BASE_PROJECT);
    vi.stubEnv('MONOLITHIC_BACKEND_SECRET', 'test-only-monolith-secret');
    vi.spyOn(projectService, 'loadProject').mockResolvedValue(structuredClone(BASE_PROJECT) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('dispatches requested scene video regeneration with feedback to the linked storyboard', async () => {
    mocks.getStoryboardForProjectContext.mockResolvedValue({
      storyboardId: 'sb-1',
      scenes: [{ sceneIndex: 0 }, { sceneIndex: 1 }, { sceneIndex: 2 }],
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      async: true,
      batchId: 'video-batch-1',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = parseEnvelope(await toolNamed('regenerate_scene').invoke({
      sceneIndex: 1,
      target: 'video',
      feedback: 'Keep the garment, but use warmer window light.',
    }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: {
        sceneIndex: 1,
        target: 'video',
        storyboardId: 'sb-1',
        queueStatus: 'queued',
        jobId: 'video-batch-1',
        results: [expect.stringContaining('video-batch-1')],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://preview.example.test/api/services/pipeline/storyboard/sb-1/generate-videos',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sceneIndices: [1], userId: 'user_scene_style' }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-editron-internal-issued-at': expect.stringMatching(/^\d+$/),
          'x-editron-internal-signature': expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it('accepts only a fresh action-and-body-bound server request', () => {
    const authEnv = { MONOLITHIC_BACKEND_SECRET: 'test-only-monolith-secret' };
    const now = 1_700_000_000_000;
    const body = JSON.stringify({ sceneIndices: [3], userId: 'user_1' });
    const headers = createPipelineVideoEnqueueInternalHeadersV1(body, { nowMs: now, env: authEnv });

    expect(verifyPipelineVideoEnqueueInternalRequestV1(headers, body, {
      nowMs: now + 1_000,
      env: authEnv,
    })).toEqual({ disposition: 'ACCEPTED' });
    expect(verifyPipelineVideoEnqueueInternalRequestV1(headers, body.replace('user_1', 'user_2'), {
      nowMs: now + 1_000,
      env: authEnv,
    })).toEqual({ disposition: 'INVALID_SIGNATURE' });
    expect(verifyPipelineVideoEnqueueInternalRequestV1(headers, body, {
      nowMs: now + PIPELINE_VIDEO_ENQUEUE_INTERNAL_MAX_AGE_MS_V1 + 1,
      env: authEnv,
    })).toEqual({ disposition: 'EXPIRED' });
    expect(verifyPipelineVideoEnqueueInternalRequestV1(headers, body, {
      nowMs: now,
      env: {},
    })).toEqual({ disposition: 'NOT_CONFIGURED' });
  });

  it('allows direct video-worker calls only in development and binds the route to the policy', () => {
    expect(resolvePipelineVideoWorkerDispatchPolicyV1({ NODE_ENV: 'development' }))
      .toEqual({ kind: 'DEVELOPMENT_FETCH' });
    expect(resolvePipelineVideoWorkerDispatchPolicyV1({ NODE_ENV: 'production' }))
      .toMatchObject({ kind: 'NOT_CONFIGURED', code: 'QSTASH_TOKEN_REQUIRED' });
    expect(resolvePipelineVideoWorkerDispatchPolicyV1({
      NODE_ENV: 'production',
      QSTASH_TOKEN: 'publisher-token',
      QSTASH_CURRENT_SIGNING_KEY: 'current-key',
    })).toMatchObject({ kind: 'NOT_CONFIGURED', code: 'QSTASH_SIGNING_KEYS_REQUIRED' });
    expect(resolvePipelineVideoWorkerDispatchPolicyV1({
      NODE_ENV: 'production',
      QSTASH_TOKEN: 'publisher-token',
      QSTASH_CURRENT_SIGNING_KEY: 'current-key',
      QSTASH_NEXT_SIGNING_KEY: 'next-key',
    })).toEqual({ kind: 'QSTASH', qstashToken: 'publisher-token' });

    const route = readFileSync('app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts', 'utf8');
    expect(route).toContain('verifyPipelineVideoEnqueueInternalRequestV1');
    expect(route).toContain('resolvePipelineVideoWorkerDispatchPolicyV1');
    expect(route).not.toContain('if (!userId && body.userId)');
    expect(route).not.toContain('QSTASH_TOKEN not set, using fire-and-forget fetch');
    expect(route.indexOf('resolvePipelineVideoWorkerDispatchPolicyV1'))
      .toBeLessThan(route.indexOf('CreditsService.hasCredits'));
  });

  it('reports completed storyboard image regeneration as a durable cross-resource receipt', async () => {
    mocks.getStoryboardForProjectContext.mockResolvedValue({
      storyboardId: 'sb-1',
      scenes: [
        { sceneIndex: 0, imageAssetId: 'old-0' },
        { sceneIndex: 1, imageAssetId: 'old-1' },
      ],
    });
    mocks.regenerateStoryboardSceneImage.mockResolvedValue({
      sceneIndex: 1,
      imageAssetId: 'new-1',
      imageUrl: 'https://cdn.example.com/new-1.png',
    });

    const output = await toolNamed('regenerate_scene').invoke({
      sceneIndex: 1,
      target: 'image',
      feedback: 'Use warmer light.',
    });
    const result = parseEnvelope(output);

    expect(result).toMatchObject({
      status: 'success',
      data: {
        storyboardId: 'sb-1',
        queueStatus: 'completed',
        jobId: 'storyboard:sb-1:scene:1:image:new-1',
        operations: [{
          target: 'image',
          status: 'completed',
          beforeAssetId: 'old-1',
          afterAssetId: 'new-1',
        }],
      },
    });
    expect(mocks.regenerateStoryboardSceneImage).toHaveBeenCalledWith({
      storyboardId: 'sb-1',
      sceneIndex: 1,
      userId: 'user_scene_style',
      feedback: 'Use warmer light.',
    });

    const enforced = enforceChatToolPostcondition({
      toolName: 'regenerate_scene',
      args: { sceneIndex: 1, target: 'image' },
      output,
      beforeProject: BASE_PROJECT,
      afterProject: BASE_PROJECT,
    });
    expect(enforced.verification).toMatchObject({
      status: 'pass',
      stateChanged: false,
      renderVerification: { status: 'deferred', required: false },
    });
  });

  it('fails visibly when the storyboard regeneration provider rejects the request', async () => {
    mocks.getStoryboardForProjectContext.mockResolvedValue({
      storyboardId: 'sb-1',
      scenes: [{ sceneIndex: 1, imageAssetId: 'old-1' }],
    });
    mocks.regenerateStoryboardSceneImage.mockRejectedValue(
      new Error('Scene regeneration failed: provider unavailable'),
    );

    const result = parseEnvelope(await toolNamed('regenerate_scene').invoke({
      sceneIndex: 1,
      target: 'image',
    }));

    expect(result).toMatchObject({
      status: 'error',
      error: {
        code: 'TOOL_HANDLER_ERROR',
        message: expect.stringContaining('provider unavailable'),
      },
    });
  });

  it('extracts a named reference profile from the requested overlay', async () => {
    mocks.extractEditDNA.mockResolvedValue(dnaFixture());

    const result = parseEnvelope(await toolNamed('extract_style').invoke({
      videoOverlayId: '1',
      sourceName: 'Reference cut',
    }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: {
        profileId: 'dna-reference-1',
        sourceName: 'Reference cut',
        cutRhythm: { avgCutsPerMinute: 18 },
        colorGrade: { temperature: 'warm' },
        graphicsDensity: 'minimal',
      },
    });
    expect(mocks.extractEditDNA).toHaveBeenCalledWith({
      assetId: undefined,
      videoOverlayId: '1',
      videoUrl: undefined,
      sourceName: 'Reference cut',
      userId: 'user_scene_style',
      projectId: 'proj_scene_style',
    });
  });

  it('passes an owned media-library asset directly to the style extraction owner', async () => {
    mocks.extractEditDNA.mockResolvedValue({
      ...dnaFixture(),
      sourceAssetId: 'asset-reference-library',
    });

    const result = parseEnvelope(await toolNamed('extract_style').invoke({
      assetId: 'asset-reference-library',
      sourceName: 'Uploaded reference',
    }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: {
        profileId: 'dna-reference-1',
        sourceAssetId: 'asset-reference-library',
      },
    });
    expect(mocks.extractEditDNA).toHaveBeenCalledWith({
      assetId: 'asset-reference-library',
      videoOverlayId: undefined,
      videoUrl: undefined,
      sourceName: 'Uploaded reference',
      userId: 'user_scene_style',
      projectId: 'proj_scene_style',
    });
  });

  it('refuses to guess a reference when a project has multiple videos', async () => {
    vi.mocked(projectService.loadProject).mockResolvedValue({
      ...BASE_PROJECT,
      overlays: [
        ...BASE_PROJECT.overlays,
        { id: 2, type: 'video', assetId: 'asset-other', from: 600, durationInFrames: 300 },
      ],
    } as any);

    const result = parseEnvelope(await toolNamed('extract_style').invoke({}));

    expect(result).toMatchObject({
      status: 'error',
      error: {
        code: 'REFERENCE_VIDEO_AMBIGUOUS',
        details: { projectVideoCount: 2 },
      },
    });
    expect(mocks.extractEditDNA).not.toHaveBeenCalled();
  });

  it('applies reference facts once through the unified planner and rejects unknown profiles', async () => {
    const dna = dnaFixture();
    mocks.loadProfile.mockResolvedValueOnce(dna).mockResolvedValueOnce(null);
    mocks.applyGroundedEditorialIntent.mockResolvedValue({
      status: 'success',
      dispatch: {
        owner: 'director-unified-planner',
        status: 'executed',
        mutated: true,
        modifiedOverlays: 3,
        reasons: [],
      },
    });

    const planned = parseEnvelope(await toolNamed('apply_style').invoke({ profileId: 'dna-reference-1', strength: 0.7 }));
    const missing = parseEnvelope(await toolNamed('apply_style').invoke({ profileId: 'dna-missing' }));

    expect(planned, JSON.stringify(planned)).toMatchObject({
      status: 'success',
      data: {
        profileId: 'dna-reference-1',
        appliedThrough: 'unified-editorial-planner',
        dispatch: { owner: 'director-unified-planner', mutated: true, modifiedOverlays: 3 },
        unappliedDimensions: ['project-wide-color-grade'],
      },
    });
    expect(mocks.applyGroundedEditorialIntent).toHaveBeenCalledWith({
      userId: 'user_scene_style',
      projectId: 'proj_scene_style',
      input: expect.objectContaining({
        strength: 0.7,
        scope: { kind: 'project' },
        families: {
          captions: { mode: 'prefer' },
          motionGraphics: { mode: 'auto' },
          transitions: { mode: 'prefer' },
          music: { mode: 'prefer' },
        },
        goal: expect.stringContaining('reference observation, not a forced form'),
      }),
    });
    expect(missing).toMatchObject({
      status: 'error',
      error: { message: "Style profile 'dna-missing' not found. Use extract_style first to create a profile." },
    });
  });

  it('does not claim a style was applied when the unified planner makes no mutation', async () => {
    const dna = dnaFixture();
    mocks.loadProfile.mockResolvedValue(dna);
    mocks.applyGroundedEditorialIntent.mockResolvedValue({
      status: 'advisory',
      dispatch: {
        owner: 'director-unified-planner',
        status: 'advisory',
        mutated: false,
        reasons: ['family-planners-rejected-all-grounded-candidates'],
      },
    });

    const result = parseEnvelope(await toolNamed('apply_style').invoke({ profileId: 'dna-reference-1' }));

    expect(result).toMatchObject({
      status: 'advisory',
      data: {
        profileId: 'dna-reference-1',
        message: 'The unified planner did not find a safe executable style change for "Reference cut".',
      },
      error: null,
    });
  });

  it('enforces one dedicated style workflow owner across the real agent graph', async () => {
    mocks.queueReferenceStyleJob.mockResolvedValue({
      jobId: 'chat_style_123',
      queueStatus: 'queued',
    });
    const toolEvents: Array<{ name: string; output: string }> = [];
    const agent = createAgent('user_scene_style', 'Style transfer test project.', {
      sessionId: 'session_scene_style',
      operationId: 'operation_scene_style',
      requestOwnerLicense: {
        version: 'editron-chat-request-owner-v1',
        owner: 'semantic-editorial-planner',
        confidence: 1,
        reason: 'The user requested a reference-style transfer.',
        requestDigest: 'reference-style-request',
        decidedBy: 'gemini',
        semanticWorkflow: 'reference-style',
      },
    });

    await agent.invoke(
      { messages: [new HumanMessage('Match this reference style.')] },
      {
        recursionLimit: 12,
        configurable: {
          projectId: 'proj_scene_style',
          projectFps: 30,
          loadPostconditionProject: async () => structuredClone(agentFixture.project),
          streamCallback: (chunk: { type: string; data: Record<string, unknown> }) => {
            if (chunk.type !== 'tool_end') return;
            toolEvents.push({
              name: String(chunk.data.tool),
              output: String(chunk.data.output),
            });
          },
        },
      },
    );

    expect(mocks.queueReferenceStyleJob).toHaveBeenCalledTimes(1);
    expect(mocks.queueReferenceStyleJob).toHaveBeenCalledWith({
      referenceAssetId: 'asset-reference',
      strength: 0.7,
    });
    expect(mocks.extractEditDNA).not.toHaveBeenCalled();
    expect(mocks.applyGroundedEditorialIntent).not.toHaveBeenCalled();
    expect(agentFixture.genericIntentExecutions).toBe(0);
    const applyOutputs = toolEvents
      .filter((event) => event.name === 'apply_reference_style')
      .map((event) => event.output);
    expect(applyOutputs).toHaveLength(3);
    expect(applyOutputs[0]).toContain('"code":"CHAT_TOOL_EVIDENCE_REQUIRED"');
    expect(applyOutputs[1]).toContain('"status":"success"');
    expect(applyOutputs[2]).toContain('"code":"CHAT_TOOL_TURN_LIMIT"');
  });
});
