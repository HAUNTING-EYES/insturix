import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeThinkForgeBlocksToMarkdown } from '@/lib/thinkforge/canonical-document-state';
import { createCurrentScriptSidecarBinding } from '@/lib/thinkforge/persistence/script-sidecar-binding';
import { adaptScriptSidecarV1 } from '@/lib/thinkforge/schemas/script-sidecar-v1-adapter';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import type { ThinkForgeBlock } from '@/lib/thinkforge/schemas/thinkforge-block';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getSession: vi.fn(),
  getScript: vi.fn(),
  isLLMParserAvailable: vi.fn(),
  parseScriptWithLLM: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/pipeline/llm-scene-parser', () => ({
  isLLMParserAvailable: mocks.isLLMParserAvailable,
  parseScriptWithLLM: mocks.parseScriptWithLLM,
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getSession: mocks.getSession,
  getScript: mocks.getScript,
}));

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/services/thinkforge/script/export-for-editron', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function block(id: string, kind: ThinkForgeBlock['kind'], text: string): ThinkForgeBlock {
  return {
    id,
    kind,
    content: [{ type: 'text', text, styles: {} }],
  };
}

function scriptSidecar() {
  return {
    sidecarVersion: 1,
    characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }],
    scenes: [{
      title: 'Same-pass Scene',
      narration: 'The workflow is clear from the first frame.',
      visualDescription: 'A focused product team reviews one connected production timeline.',
      videoMotionPrompt: 'Slow push toward the team as the timeline resolves.',
      audioDescription: 'Quiet studio room tone.',
      musicDescription: 'A restrained, optimistic pulse.',
      sfxDescription: 'A soft confirmation chime.',
      durationSeconds: 8,
      mood: 'inspirational',
      imageQualityTokens: 'editorial, considered lighting',
      videoQualityTokens: 'natural motion, stable camera',
      generationUnitId: 'unit_1',
      primaryVisualForUnit: true,
      sceneType: 'continuous',
      assetRecommendation: 'ai-video',
      lines: [{
        text: 'The workflow is clear from the first frame.',
        speakerId: 'narrator',
        onCamera: true,
        delivery: 'sync-dialogue',
      }],
      sourceRefs: ['brief_user'],
      charactersPresent: ['narrator'],
      relipSafe: true,
    }],
    overallMusicPrompt: 'A restrained, optimistic pulse.',
    characterDescriptions: { narrator: 'Warm, credible narrator.' },
    colorPalette: ['#0B1020', '#F4C95D'],
    environmentNotes: 'Modern studio workspace.',
    globalEditDirections: { pacing: 'medium' },
    suggestedProfileCategory: 'production-mode',
    sourceRefs: ['brief_user'],
  };
}

const VIDEO_SCRIPT_CONTRACT = createThinkForgeWriterContract('video_script');

function boundWriterOutput(
  documentContent: string,
  value: Record<string, unknown>,
  documentVersion: number,
  extra: Record<string, unknown> = {},
) {
  return {
    ...extra,
    writerType: 'script',
    sidecarVersion: value.sidecarVersion,
    scriptSidecar: value,
    sidecarBinding: createCurrentScriptSidecarBinding({
      documentContent,
      documentVersion,
      sidecar: value,
    }),
  };
}

function longFormChapterPlanForSingleScene() {
  return {
    version: 1,
    title: 'Same-pass Scene',
    narrativeThesis: 'One complete workflow remains visible from first frame to final decision.',
    targetDurationSeconds: 8,
    audienceJourney: {
      openingState: 'The workflow is fragmented.',
      closingState: 'The workflow is connected.',
    },
    continuityBible: {
      pointOfView: 'A clear observer.',
      temporalFrame: 'One continuous moment.',
      toneProgression: ['clarity'],
      recurringMotifs: [],
      terminologyInvariants: ['workflow'],
    },
    characters: [{
      id: 'narrator',
      name: 'Narrator',
      narrativeRole: 'Explain the connected workflow.',
      voice: 'Warm and credible.',
      openingState: 'Introduces the workflow.',
      closingState: 'Confirms the connected outcome.',
      invariantTraits: ['clear'],
    }],
    continuityThreads: [],
    acts: [{
      id: 'act_1',
      title: 'The connected workflow',
      narrativePurpose: 'Show the complete production timeline.',
      chapters: [{
        id: 'chapter_workflow',
        title: 'The workflow',
        narrativePurpose: 'Establish the connected workflow as one coherent section.',
        audienceStateBefore: 'The workflow is fragmented.',
        audienceStateAfter: 'The workflow is connected.',
        sceneBlueprints: [{
          id: 'scene_1',
          title: 'Same-pass Scene',
          narrativePurpose: 'Keep the production timeline connected from first frame to final decision.',
          openingState: 'The team sees separate steps.',
          development: ['Show the connected timeline.'],
          closingState: 'The workflow is visible as one system.',
          durationIntentSeconds: 8,
          requiredSourceRefs: ['brief_user'],
          requiredCharacterIds: ['narrator'],
          continuityThreadIds: [],
        }],
      }],
    }],
  };
}
describe('export-for-editron route', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.getSession.mockReset();
    mocks.getScript.mockReset();
    mocks.isLLMParserAvailable.mockReset();
    mocks.parseScriptWithLLM.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.getSession.mockImplementation(async (sessionId: string) => ({
      _id: sessionId,
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: {},
    }));
    mocks.getScript.mockImplementation(async (sessionId: string, scriptId: string) => ({
      _id: `stored_${scriptId}`,
      sessionId,
      scriptId,
      title: 'Stored script',
      content: '',
      blocks: [],
      contentContract: VIDEO_SCRIPT_CONTRACT,
      metadata: {},
    }));
    mocks.isLLMParserAvailable.mockReturnValue(true);
    mocks.parseScriptWithLLM.mockResolvedValue({
      scenes: [
        {
          title: 'Hook',
          narration: 'Launch the edit with a clear claim.',
          visualDescription: 'Founder points at a product timeline.',
          durationSeconds: 4,
          mood: 'focused',
        },
      ],
      overallMusicPrompt: 'restrained pulse',
      characterDescriptions: {},
      colorPalette: ['#111111'],
      environmentNotes: 'studio',
      globalEditDirections: { pacing: 'medium' },
      suggestedProfileCategory: 'brand-ad',
    });
  });

  it('rejects a missing exact document ID before DB or parser work', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_1',
      scriptId: '   ',
      plainText: 'This must never reach the parser.',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('scriptId is required');
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
  });

  it('authorizes org access and exports from the canonical session identity', async () => {
    mocks.getSession.mockResolvedValueOnce({
      _id: 'tf_session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {},
    });
    mocks.getScript.mockResolvedValueOnce({
      _id: 'stored_script_canonical',
      sessionId: 'tf_session_canonical',
      scriptId: 'script_canonical',
      title: 'Stored script',
      content: '',
      blocks: [],
      contentContract: VIDEO_SCRIPT_CONTRACT,
      metadata: {},
    });
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_alias',
      scriptId: 'script_canonical',
      plainText: 'A verified script snapshot.',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('tf_session_alias', 'user_1', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('tf_session_canonical', 'script_canonical');
    expect(payload.productionManifest).toMatchObject({
      sourceSessionId: 'tf_session_canonical',
      sourceScriptId: 'script_canonical',
    });
  });

  it('fails before parser work when the exact stored document does not exist', async () => {
    mocks.getScript.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_1',
      scriptId: 'missing_script',
      plainText: 'A client snapshot cannot replace a missing stored document.',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe('ThinkForge document not found');
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
  });

  it('rejects posts before request parsing or scene generation', async () => {
    mocks.getScript.mockResolvedValueOnce({
      _id: 'stored_post_1',
      sessionId: 'tf_session_1',
      scriptId: 'post_1',
      title: 'Stored post',
      content: 'A social post.',
      blocks: [],
      contentContract: createThinkForgeWriterContract('social_post'),
      metadata: {},
    });
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_1',
      scriptId: 'post_1',
      plainText: 'Scene 1: client text must not change the saved document kind.',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      success: false,
      reason: 'export-destination-incompatible',
      retryable: false,
    });
    expect(mocks.isLLMParserAvailable).not.toHaveBeenCalled();
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
  });

  it('fails closed when the saved document contract is missing', async () => {
    mocks.getScript.mockResolvedValueOnce({
      _id: 'stored_legacy_1',
      sessionId: 'tf_session_1',
      scriptId: 'legacy_1',
      title: 'Legacy document',
      content: 'Unclassified content.',
      blocks: [],
      metadata: {},
    });
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_1',
      scriptId: 'legacy_1',
      plainText: 'Client text cannot supply the missing contract.',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({
      success: false,
      reason: 'export-document-contract-invalid',
      retryable: false,
    });
    expect(mocks.isLLMParserAvailable).not.toHaveBeenCalled();
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
  });

  it('passes brand identity to the parser without echoing raw script text', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');
    const secretScript = 'PRIVATE LAUNCH SCRIPT: do not echo this copy to the client.';

    const response = await POST(request({
      plainText: secretScript,
      sessionId: 'tf_session_1',
      scriptId: 'script_1',
      aspectRatio: '16:9',
      artStyle: 'cinematic',
      brandId: 'brand_from_project_meta',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.parseScriptWithLLM).toHaveBeenCalledWith(
      secretScript,
      expect.objectContaining({
        brandId: 'brand_from_project_meta',
        userId: 'user_1',
      }),
    );
    expect(payload.rawContent).toBeUndefined();
    expect(payload.title).toBe('Untitled Script');
    expect(JSON.stringify(payload)).not.toContain('PRIVATE LAUNCH SCRIPT');
  });
  it('passes explicit long-form duration to the parser and returns a production manifest', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');
    const fiveMinuteScript = 'Duration: 5 minutes\nA product launch film with multiple proof chapters.';

    const response = await POST(request({
      plainText: fiveMinuteScript,
      sessionId: 'tf_session_5m',
      scriptId: 'script_5m',
      aspectRatio: '16:9',
      artStyle: 'cinematic',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.parseScriptWithLLM).toHaveBeenCalledWith(
      fiveMinuteScript,
      expect.objectContaining({ targetDuration: 300 }),
    );
    expect(payload.productionManifest).toMatchObject({
      version: 1,
      sourceService: 'thinkforge',
      sourceSessionId: 'tf_session_5m',
      sourceScriptId: 'script_5m',
      targetDurationSeconds: 300,
      targetDurationSource: 'script-explicit',
      expectedSceneCount: 1,
      expectedStoryboardImages: 1,
      expectedVideoClips: 1,
      coveragePolicy: 'production-require-all-scenes',
    });
    expect(payload.productionManifest.warnings).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain('product launch film');
  });

  it('preserves multi-hour runtime instead of silently clamping it to one hour', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');
    const documentaryScript = 'A documentary with an approved two-hour runtime.';

    const response = await POST(request({
      plainText: documentaryScript,
      sessionId: 'tf_session_2h',
      scriptId: 'script_2h',
      targetDurationSeconds: 7_200,
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.parseScriptWithLLM).toHaveBeenCalledWith(
      documentaryScript,
      expect.objectContaining({ targetDuration: 7_200 }),
    );
    expect(payload.productionManifest).toMatchObject({
      targetDurationSeconds: 7_200,
      targetDurationSource: 'request',
    });
  });

  it('uses the persisted same-pass sidecar for an unchanged saved script', async () => {
    const savedBlocks = [
      block('blk_1', 'header', 'Same-pass Scene'),
      block('blk_2', 'paragraph', 'The workflow is clear from the first frame.'),
    ];
    const savedContent = serializeThinkForgeBlocksToMarkdown(savedBlocks);
    const persistedSidecar = scriptSidecar();
    mocks.getSession.mockResolvedValue({
      _id: 'tf_session_sidecar',
      userId: 'user_1',
      projectMeta: { brandId: 'brand_editron' },
    });
    mocks.getScript.mockResolvedValue({
      _id: 'script_doc_sidecar',
      sessionId: 'tf_session_sidecar',
      scriptId: 'script_sidecar',
      title: 'Same-pass Scene',
      content: savedContent,
      blocks: savedBlocks,
      contentContract: VIDEO_SCRIPT_CONTRACT,
      version: 1,
      metadata: {
        briefSnapshot: {
          output: { platform: 'youtube', targetDurationSec: 8, aspectRatio: '16:9', count: 1, format: 'auto-edit' },
          resolution: { confirmed: ['platform'], inferred: [] },
          entryPoint: 'thinkforge',
          casting: {
            map: {
              narrator: { avatarProfileId: 'avatar_123', voice: { mode: 'cloned', voiceReferenceUrl: 'https://private.example/voice.wav' } },
            },
          },
        },
        authoringContextSnapshot: {
          version: 1,
          resolvedAt: '2026-08-12T00:00:00.000Z',
          brand: {
            brandId: 'brand_editron',
            recordId: 'brand_record_editron',
            profileUpdatedAt: '2026-08-11T00:00:00.000Z',
            profileFingerprint: 'profile_fingerprint_editron',
          },
          retrieval: {
            projectFactIds: ['fact_private'],
            globalFactIds: ['fact_global'],
            interactionPatternTypes: ['hook'],
          },
          writingKnowledgeVersion: 'writing-knowledge-v3',
        },
        writerOutput: boundWriterOutput(savedContent, persistedSidecar, 1, {
          sourceLedger: {
            ledgerVersion: 1,
            entries: [{
              referenceId: 'brief_user',
              kind: 'user_brief',
              title: 'User brief',
              summary: 'A factual brief.',
              confidence: 1,
              provenance: { origin: 'user_prompt' },
            }],
          },
        }),
      },
    });
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_sidecar',
      scriptId: 'script_sidecar',
      blocks: savedBlocks,
      aspectRatio: '16:9',
      artStyle: 'cinematic',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.scenes).toEqual([expect.objectContaining({
      title: 'Same-pass Scene',
      narration: 'The workflow is clear from the first frame.',
      generationUnitId: 'unit_1',
    })]);
    expect(payload.productionManifest.parser).toMatchObject({
      fallbackUsed: false,
      sidecarUsed: true,
      sidecarVersion: 1,
      sidecarSource: 'stored-script',
    });
    expect(payload.productionManifest.thinkforgeContext).toMatchObject({
      version: 1,
      authoringProvenance: {
        version: 1,
        resolvedAt: '2026-08-12T00:00:00.000Z',
        brand: {
          brandId: 'brand_editron',
          recordId: 'brand_record_editron',
          profileUpdatedAt: '2026-08-11T00:00:00.000Z',
          profileFingerprint: 'profile_fingerprint_editron',
        },
        writingKnowledgeVersion: 'writing-knowledge-v3',
      },
      briefSnapshot: expect.objectContaining({
        casting: { map: { narrator: expect.objectContaining({ avatarProfileId: 'avatar_123' }) } },
      }),
      sourceLedger: expect.objectContaining({ ledgerVersion: 1 }),
      sidecarSourceRefs: ['brief_user'],
      sidecarCompilation: {
        version: 1,
        sourceSidecarVersion: 1,
        canonicalSidecarVersion: 2,
        spokenTextSource: 'beat-lines',
        narrativeSidecar: expect.objectContaining({ sidecarVersion: 2 }),
        sceneBindings: [{
          sceneIndex: 0,
          actId: 'act_1',
          narrativeSceneId: 'scene_1',
          beatIds: ['beat_1_1'],
          lineIds: ['line_1_1'],
          sourceRefs: ['brief_user'],
          renderSegmentIds: ['render_segment_1_1'],
          durationSource: 'legacy-v1',
        }],
      },
      avatarDirectives: [{
        sceneIndex: 0,
        durationSeconds: 8,
        relipSafe: true,
        speakers: [{
          characterId: 'narrator',
          avatarProfileId: 'avatar_123',
          voiceMode: 'cloned',
          lineText: 'The workflow is clear from the first frame.',
        }],
      }],
    });
    expect(payload.productionManifest.thinkforgeContext.briefSnapshot.casting.map.narrator.voice).toEqual({ mode: 'cloned' });
    const thinkforgeContext = JSON.stringify(payload.productionManifest.thinkforgeContext);
    expect(thinkforgeContext).not.toContain('private.example');
    expect(thinkforgeContext).not.toContain('fact_private');
    expect(thinkforgeContext).not.toContain('fact_global');
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
    expect(payload.scenes[0].sourceRefs).toBeUndefined();
    expect(payload.scenes[0].charactersPresent).toBeUndefined();
  });
  it('fails closed when saved authoring provenance conflicts with the session brand', async () => {
    const savedBlocks = [
      block('blk_1', 'header', 'Bound brand script'),
      block('blk_2', 'paragraph', 'This export must not cross a brand boundary.'),
    ];
    mocks.getSession.mockResolvedValue({
      _id: 'tf_session_brand_mismatch',
      userId: 'user_1',
      projectMeta: { brandId: 'brand_bound_to_session' },
    });
    mocks.getScript.mockResolvedValue({
      _id: 'script_doc_brand_mismatch',
      sessionId: 'tf_session_brand_mismatch',
      scriptId: 'script_brand_mismatch',
      title: 'Bound brand script',
      content: '',
      blocks: savedBlocks,
      contentContract: VIDEO_SCRIPT_CONTRACT,
      metadata: {
        authoringContextSnapshot: {
          version: 1,
          brand: { brandId: 'brand_from_different_document' },
        },
      },
    });
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_brand_mismatch',
      scriptId: 'script_brand_mismatch',
      blocks: savedBlocks,
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      success: false,
      reason: 'authoring-provenance-brand-mismatch',
    });
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
  });
  it('rejects browser-ahead edits instead of reparsing around a persisted sidecar', async () => {
    const savedContent = 'This is the saved script.';
    const persistedSidecar = scriptSidecar();
    mocks.getSession.mockResolvedValue({ _id: 'tf_session_edited', userId: 'user_1' });
    mocks.getScript.mockResolvedValue({
      _id: 'script_doc_edited',
      sessionId: 'tf_session_edited',
      scriptId: 'script_edited',
      title: 'Saved script',
      content: savedContent,
      blocks: [],
      contentContract: VIDEO_SCRIPT_CONTRACT,
      version: 1,
      metadata: { writerOutput: boundWriterOutput(savedContent, persistedSidecar, 1) },
    });
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_edited',
      scriptId: 'script_edited',
      plainText: 'This is a materially edited script.',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.reason).toBe('document-not-committed');
    expect(payload.retryable).toBe(true);
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
  });
  it('recovers the stored script when the request is a stale one-block title snapshot', async () => {
    mocks.isLLMParserAvailable.mockReturnValue(false);
    mocks.getSession.mockResolvedValue({ _id: 'tf_session_stale', userId: 'user_1' });
    mocks.getScript.mockResolvedValue({
      _id: 'script_doc_1',
      sessionId: 'tf_session_stale',
      scriptId: 'script_1',
      title: 'Scene 1: The Missed Future',
      content: '',
      blocks: [
        block('blk_scene_1', 'header', 'Scene 1: The Missed Future'),
        block('blk_scene_1_narration', 'paragraph', 'A designer stares at a fragmented workflow and loses time to scattered tools.'),
        block('blk_scene_1_visual', 'action', 'A desk is covered with disconnected dashboards, message threads, and duplicated exports.'),
        block('blk_scene_2', 'header', 'Scene 2: Insturix Platform'),
        block('blk_scene_2_narration', 'paragraph', 'Insturix turns scattered approvals into one connected production pipeline.'),
        block('blk_scene_2_visual', 'action', 'The product dashboard brings briefs, assets, reviews, and delivery status into a single workspace.'),
      ],
      contentContract: VIDEO_SCRIPT_CONTRACT,
      metadata: {},
      version: 2,
      createdAt: new Date('2026-07-04T00:00:00.000Z'),
      updatedAt: new Date('2026-07-04T00:00:00.000Z'),
    });
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_stale',
      scriptId: 'script_1',
      plainText: 'Scene 1: The Missed Future',
      blocks: [block('blk_stale_title', 'header', 'Scene 1: The Missed Future')],
      aspectRatio: '16:9',
      artStyle: 'cinematic',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sceneCount).toBe(2);
    expect(payload.title).toBe('Scene 1: The Missed Future');
    expect(payload.productionManifest.parser).toMatchObject({
      llmAvailable: false,
      fallbackUsed: true,
      source: 'stored-script',
      storedScriptRecovered: true,
    });
    expect(mocks.getSession).toHaveBeenCalledWith('tf_session_stale', 'user_1', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('tf_session_stale', 'script_1');
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
  });
  it('fails loudly instead of returning parser sentinel scenes', async () => {
    mocks.parseScriptWithLLM.mockResolvedValueOnce({
      scenes: [
        {
          title: 'Hook',
          narration: 'Launch the edit.',
          visualDescription: 'Founder points at a product timeline.',
          durationSeconds: 4,
          mood: 'focused',
        },
        {
          title: 'SCRIPT_TRUNCATED',
          narration: '',
          visualDescription: 'Internal parser marker.',
          durationSeconds: 1,
          mood: 'neutral',
        },
      ],
      overallMusicPrompt: '',
      characterDescriptions: {},
      colorPalette: [],
      environmentNotes: '',
      suggestedProfileCategory: 'brand-ad',
    });
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      plainText: 'A long launch script that the parser mishandled.',
      sessionId: 'tf_session_1',
      scriptId: 'script_1',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.reason).toBe('parser-sentinel-scene');
    expect(payload.retryable).toBe(false);
    expect(payload.scenes).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('SCRIPT_TRUNCATED');
  });

  it('rejects over-limit scripts before the LLM parser can create fake scenes', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');
    const longScript = 'A'.repeat(24_001);

    const response = await POST(request({
      plainText: longScript,
      sessionId: 'tf_session_1',
      scriptId: 'script_1',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.reason).toBe('script-too-long-for-parser');
    expect(payload.retryable).toBe(false);
    expect(payload.diagnostic).toEqual(expect.objectContaining({
      rawContentLength: 24_001,
      maxParserInputChars: 24_000,
    }));
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
  });

  it('fails closed instead of reparsing an unchanged document with an invalid claimed V2 sidecar', async () => {
    const savedBlocks = [
      block('blk_v2_title', 'header', 'Invalid V2 contract'),
      block('blk_v2_body', 'paragraph', 'This exact saved document must not fall through to prose parsing.'),
    ];
    const savedContent = serializeThinkForgeBlocksToMarkdown(savedBlocks);
    const invalidSidecar = {
      sidecarVersion: 2,
      spokenTextSource: 'beat-lines',
      characters: [],
      acts: [],
      sourceRefs: [],
    };
    mocks.getSession.mockResolvedValue({ _id: 'tf_session_invalid_v2', userId: 'user_1' });
    mocks.getScript.mockResolvedValue({
      _id: 'script_doc_invalid_v2',
      sessionId: 'tf_session_invalid_v2',
      scriptId: 'script_invalid_v2',
      title: 'Invalid V2 contract',
      content: savedContent,
      blocks: savedBlocks,
      contentContract: VIDEO_SCRIPT_CONTRACT,
      version: 1,
      metadata: {
        writerOutput: boundWriterOutput(savedContent, invalidSidecar, 1),
      },
    });
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_invalid_v2',
      scriptId: 'script_invalid_v2',
      blocks: savedBlocks,
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({
      success: false,
      reason: 'script-sidecar-payload-invalid',
      retryable: false,
      diagnostic: {
        bindingReason: 'sidecar_schema_invalid',
      },
    });
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
  });

  it('fails closed when a schema-valid V2 sidecar cannot be compiled for Editron', async () => {
    const savedBlocks = [
      block('blk_v2_compile_title', 'header', 'Unresolved production duration'),
      block('blk_v2_compile_body', 'paragraph', 'This saved contract must not fall through to prose parsing.'),
    ];
    const savedContent = serializeThinkForgeBlocksToMarkdown(savedBlocks);
    const v2 = adaptScriptSidecarV1(scriptSidecar()).sidecar;
    const narrativeScene = v2.acts[0]!.narrativeScenes[0]!;
    narrativeScene.durationIntentSeconds = undefined;
    narrativeScene.beats[0]!.durationIntentSeconds = undefined;
    v2.renderPlan!.renderSegments = [];
    mocks.getSession.mockResolvedValue({ _id: 'tf_session_uncompilable_v2', userId: 'user_1' });
    mocks.getScript.mockResolvedValue({
      _id: 'script_doc_uncompilable_v2',
      sessionId: 'tf_session_uncompilable_v2',
      scriptId: 'script_uncompilable_v2',
      title: 'Unresolved production duration',
      content: savedContent,
      blocks: savedBlocks,
      contentContract: VIDEO_SCRIPT_CONTRACT,
      version: 1,
      metadata: { writerOutput: boundWriterOutput(savedContent, v2, 1) },
    });
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_uncompilable_v2',
      scriptId: 'script_uncompilable_v2',
      blocks: savedBlocks,
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({
      success: false,
      reason: 'invalid-script-sidecar',
      retryable: false,
      diagnostic: {
        code: 'scene-duration-unresolved',
        claimedSidecarVersion: 2,
      },
    });
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
  });

  it('uses a valid claimed V2 sidecar and transports its normalized narrative hierarchy', async () => {
    const savedBlocks = [
      block('blk_v2_valid_title', 'header', 'Same-pass Scene'),
      block('blk_v2_valid_body', 'paragraph', 'The workflow is clear from the first frame.'),
    ];
    const savedContent = serializeThinkForgeBlocksToMarkdown(savedBlocks);
    const v2 = adaptScriptSidecarV1(scriptSidecar()).sidecar;
    mocks.getSession.mockResolvedValue({ _id: 'tf_session_valid_v2', userId: 'user_1' });
    mocks.getScript.mockResolvedValue({
      _id: 'script_doc_valid_v2',
      sessionId: 'tf_session_valid_v2',
      scriptId: 'script_valid_v2',
      title: 'Same-pass Scene',
      content: savedContent,
      blocks: savedBlocks,
      contentContract: VIDEO_SCRIPT_CONTRACT,
      version: 1,
      metadata: {
        writerOutput: boundWriterOutput(savedContent, v2, 1, {
          longForm: { version: 1, jobId: 'longscript_1', plan: longFormChapterPlanForSingleScene() },
        }),
      },
    });
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_valid_v2',
      scriptId: 'script_valid_v2',
      blocks: savedBlocks,
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.productionManifest.parser).toMatchObject({
      sidecarUsed: true,
      sidecarVersion: 2,
    });
    expect(payload.productionManifest.thinkforgeContext.sidecarCompilation).toMatchObject({
      sourceSidecarVersion: 2,
      canonicalSidecarVersion: 2,
      narrativeSidecar: {
        acts: [{
          id: 'act_1',
          narrativeScenes: [{
            id: 'scene_1',
            beats: [{ id: 'beat_1_1' }],
          }],
        }],
      },
    });
    expect(payload.productionManifest.thinkforgeContext.sidecarCompilation.sceneBindings).toEqual([
      expect.objectContaining({
        actId: 'act_1',
        chapterId: 'chapter_workflow',
        narrativeSceneId: 'scene_1',
      }),
    ]);
    expect(payload.scenes).toHaveLength(1);
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
  });
});
