import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  applyGroundedEditorialIntent: vi.fn(),
  extractEditDNA: vi.fn(),
  getStoryboard: vi.fn(),
  getStoryboardByProjectId: vi.fn(),
  loadProfile: vi.fn(),
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
          const parts = step === 0
            ? [
                ...Array.from({ length: 3 }, (_, index) => ({
                  functionCall: {
                    name: 'extract_style',
                    args: { videoUrl: 'https://cdn.example.com/reference.mp4', sourceName: 'Reference cut' },
                  },
                  thoughtSignature: `signed-extract-${index}`,
                })),
                ...Array.from({ length: 5 }, (_, index) => ({
                  functionCall: {
                    name: 'apply_editorial_intent',
                    args: { goal: 'Match the reference style.' },
                  },
                  thoughtSignature: `signed-generic-${index}`,
                })),
              ]
            : step === 1 || step === 2
              ? [{
                  functionCall: {
                    name: 'apply_style',
                    args: { profileId: 'dna-reference-1', strength: 0.7 },
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
  ],
  filterChatShadowAuthorityTools: <T>(tools: T) => tools,
}));

import { createTools } from '@/lib/editron/agent/tools';
import { createAgent } from '@/lib/editron/agent/agent-graph';
import { projectService } from '@/lib/editron/services/project-service';

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
    vi.spyOn(projectService, 'loadProject').mockResolvedValue(structuredClone(BASE_PROJECT) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('dispatches requested scene video regeneration with feedback to the linked storyboard', async () => {
    mocks.getStoryboardByProjectId.mockResolvedValue({ storyboardId: 'sb-1' });
    mocks.getStoryboard.mockResolvedValue({
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
        results: [expect.stringContaining('video-batch-1')],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://preview.example.test/api/services/pipeline/storyboard/sb-1/generate-videos',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sceneIndices: [1], userId: 'user_scene_style' }),
      }),
    );
    expect(mocks.getStoryboard).toHaveBeenCalledWith('sb-1', 'user_scene_style');
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
      videoOverlayId: '1',
      videoUrl: undefined,
      sourceName: 'Reference cut',
      userId: 'user_scene_style',
      projectId: 'proj_scene_style',
    });
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
    mocks.extractEditDNA.mockResolvedValue(dnaFixture());
    mocks.loadProfile.mockResolvedValue(dnaFixture());
    mocks.applyGroundedEditorialIntent.mockImplementation(async () => {
      agentFixture.project = {
        ...agentFixture.project,
        overlays: [
          ...(agentFixture.project.overlays as unknown[]),
          {
            id: 'style-result-1',
            type: 'text',
            content: 'Reference-led title',
            from: 30,
            durationInFrames: 90,
          },
        ],
      };
      return {
        status: 'success',
        dispatch: {
          owner: 'director-unified-planner',
          status: 'executed',
          mutated: true,
          modifiedOverlays: 1,
          reasons: [],
        },
      };
    });
    const toolEvents: Array<{ name: string; output: string }> = [];
    const agent = createAgent('user_scene_style', 'Style transfer test project.');

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

    expect(mocks.extractEditDNA).toHaveBeenCalledTimes(1);
    expect(mocks.applyGroundedEditorialIntent).toHaveBeenCalledTimes(1);
    expect(agentFixture.genericIntentExecutions).toBe(0);
    expect(toolEvents.filter((event) => event.name === 'extract_style')).toHaveLength(3);
    expect(toolEvents.filter((event) => event.name === 'apply_editorial_intent')).toHaveLength(5);
    expect(toolEvents.filter((event) => event.name === 'apply_style')).toHaveLength(2);
    expect(toolEvents
      .filter((event) => event.name === 'apply_editorial_intent')
      .every((event) => event.output.includes('CHAT_TOOL_OWNER_CONFLICT'))).toBe(true);
    const applyOutputs = toolEvents
      .filter((event) => event.name === 'apply_style')
      .map((event) => event.output);
    expect(applyOutputs[0]).toContain('"status":"success"');
    expect(applyOutputs[0]).toContain('"postconditionVerification":{"version":"editron-chat-postcondition-v1","status":"pass"');
    expect(applyOutputs[1]).toBe(applyOutputs[0]);
  });
});
