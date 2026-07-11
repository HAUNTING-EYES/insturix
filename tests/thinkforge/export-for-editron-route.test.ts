import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getSession: vi.fn(),
  getScript: vi.fn(),
  isLLMParserAvailable: vi.fn(),
  parseScriptWithLLM: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/pipeline/llm-scene-parser', () => ({
  LLM_SCENE_PARSER_MAX_INPUT_CHARS: 24_000,
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

function block(id: string, kind: string, text: string) {
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
        onCamera: false,
        delivery: 'voiceover',
      }],
      sourceRefs: [],
      charactersPresent: ['narrator'],
    }],
    overallMusicPrompt: 'A restrained, optimistic pulse.',
    characterDescriptions: { narrator: 'Warm, credible narrator.' },
    colorPalette: ['#0B1020', '#F4C95D'],
    environmentNotes: 'Modern studio workspace.',
    globalEditDirections: { pacing: 'medium' },
    suggestedProfileCategory: 'production-mode',
    sourceRefs: [],
  };
}
describe('export-for-editron route', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.getSession.mockReset();
    mocks.getScript.mockReset();
    mocks.isLLMParserAvailable.mockReset();
    mocks.parseScriptWithLLM.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
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
  it('uses the persisted same-pass sidecar for an unchanged saved script', async () => {
    const savedBlocks = [
      block('blk_1', 'header', 'Same-pass Scene'),
      block('blk_2', 'paragraph', 'The workflow is clear from the first frame.'),
    ];
    mocks.getSession.mockResolvedValue({ _id: 'tf_session_sidecar', userId: 'user_1' });
    mocks.getScript.mockResolvedValue({
      _id: 'script_doc_sidecar',
      sessionId: 'tf_session_sidecar',
      scriptId: 'script_sidecar',
      title: 'Same-pass Scene',
      content: '',
      blocks: savedBlocks,
      metadata: { writerOutput: { writerType: 'script', scriptSidecar: scriptSidecar() } },
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
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toContain('sourceRefs');
    expect(JSON.stringify(payload)).not.toContain('charactersPresent');
  });
  it('does not reuse a persisted sidecar after the export source was edited', async () => {
    mocks.getSession.mockResolvedValue({ _id: 'tf_session_edited', userId: 'user_1' });
    mocks.getScript.mockResolvedValue({
      _id: 'script_doc_edited',
      sessionId: 'tf_session_edited',
      scriptId: 'script_edited',
      title: 'Saved script',
      content: 'This is the saved script.',
      blocks: [],
      metadata: { writerOutput: { writerType: 'script', scriptSidecar: scriptSidecar() } },
    });
    const { POST } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');

    const response = await POST(request({
      sessionId: 'tf_session_edited',
      scriptId: 'script_edited',
      plainText: 'This is a materially edited script.',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.parseScriptWithLLM).toHaveBeenCalledWith(
      'This is a materially edited script.',
      expect.any(Object),
    );
    expect(payload.productionManifest.parser.sidecarUsed).toBe(false);
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
    expect(mocks.getSession).toHaveBeenCalledWith('tf_session_stale', 'user_1');
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
});