import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isLLMParserAvailable: vi.fn(),
  parseScriptWithLLM: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/pipeline/llm-scene-parser', () => ({
  LLM_SCENE_PARSER_MAX_INPUT_CHARS: 24_000,
  isLLMParserAvailable: mocks.isLLMParserAvailable,
  parseScriptWithLLM: mocks.parseScriptWithLLM,
}));

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/services/thinkforge/script/export-for-editron', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('export-for-editron route', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
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