import { describe, expect, it, vi } from 'vitest';

import {
  chatCompletionsUrl,
  createGlmVisionClient,
  parseJsonContent,
  type FetchLike,
  type GlmVisionJsonClient,
  type GlmVisionJsonRequest,
  type GlmVisionJsonResult,
} from '../../lib/editron/reference-video/glm-vision-client';
import {
  analyzeSaasReferenceVideo,
  buildGateFrameSchedule,
  buildReferenceVideoCacheKey,
  decideSaasGate,
  getReferenceEvaluationWindowSec,
  validateSaasReferenceVideo,
  type SaasReferenceGate,
} from '../../lib/editron/reference-video/saas-reference-video-analyzer';

type FetchMockArgs = [input: Parameters<FetchLike>[0], init?: Parameters<FetchLike>[1]];

describe('GLM vision client', () => {
  it('sends OpenAI-compatible JSON requests to Z.AI with thinking disabled', async () => {
    const fetchMock = vi.fn<FetchMockArgs, ReturnType<FetchLike>>(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '```json\n{"isSaasVideo":true}\n```' } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 12,
        total_tokens: 112,
        prompt_tokens_details: { cached_tokens: 40 },
      },
    }), { status: 200 }));
    const client = createGlmVisionClient({
      apiKey: 'zai-test-key',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      model: 'glm-test',
      fetchImpl: fetchMock as unknown as FetchLike,
    });

    const result = await client.analyzeJson({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Return JSON.' }] }],
      cacheKey: 'cache:a',
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.json : undefined).toEqual({ isSaasVideo: true });
    expect(result.ok ? result.usage?.cachedTokens : undefined).toBe(40);

    const fetchCall = fetchMock.mock.calls[0]!;
    expect(fetchCall[0]).toBe('https://api.z.ai/api/paas/v4/chat/completions');
    expect(fetchCall[1]?.headers).toMatchObject({
      authorization: 'Bearer zai-test-key',
      'content-type': 'application/json',
    });

    const body = JSON.parse(String(fetchCall[1]?.body));
    expect(body).toMatchObject({
      model: 'glm-test',
      stream: false,
      temperature: 0,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
    });
  });

  it('parses OpenAI-compatible array response content parts', async () => {
    const fetchMock = vi.fn<FetchMockArgs, ReturnType<FetchLike>>(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: [
            { type: 'text', text: '```json\n{"ok":true}\n```' },
            { type: 'metadata', text: '' },
          ],
        },
      }],
    }), { status: 200 }));
    const client = createGlmVisionClient({
      apiKey: 'zai-test-key',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      model: 'glm-test',
      fetchImpl: fetchMock as unknown as FetchLike,
    });

    const result = await client.analyzeJson({
      messages: [{ role: 'user', content: 'Return JSON.' }],
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.json : undefined).toEqual({ ok: true });
    expect(result.ok ? result.content : '').toContain('"ok":true');
  });

  it('fails closed when no API key is configured', async () => {
    const fetchMock = vi.fn<FetchMockArgs, ReturnType<FetchLike>>();
    const client = createGlmVisionClient({
      apiKey: '',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      fetchImpl: fetchMock as unknown as FetchLike,
    });

    const result = await client.analyzeJson({
      messages: [{ role: 'user', content: 'Return JSON.' }],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toContain('API key is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes chat completion URLs and JSON fences', () => {
    expect(chatCompletionsUrl('https://host/v1/')).toBe('https://host/v1/chat/completions');
    expect(chatCompletionsUrl('https://host/v1/chat/completions')).toBe('https://host/v1/chat/completions');
    expect(parseJsonContent('Here:\n```json\n{"ok":true}\n```').ok).toBe(true);
  });
});

describe('SaaS reference video analyzer', () => {
  it('requires five frame samples for the deterministic gate', async () => {
    const result = await validateSaasReferenceVideo({
      videoUrl: 'https://cdn.example.com/reference.mp4',
      frameImageUrls: ['https://cdn.example.com/frame-0.jpg'],
      client: scriptedClient([]),
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toBe('invalid_reference_video_input');
    expect(result.ok ? [] : result.diagnostics).toContain('Exactly 5 sampled frame image URLs are required.');
  });

  it('rejects the reference when one sampled frame fails and all frames are required', () => {
    const gate = gatePayload({
      sampledFrameVerdicts: [
        frameVerdict(0, true),
        frameVerdict(1, true),
        frameVerdict(2, false),
        frameVerdict(3, true),
        frameVerdict(4, true),
      ],
    });

    const decision = decideSaasGate(gate);

    expect(decision.accepted).toBe(false);
    expect(decision.reason).toContain('Only 4/5 frames passed');
  });

  it('passes the gate, caps analysis to two minutes, and sends video input to GLM', async () => {
    const client = scriptedClient([
      gatePayload(),
      analysisPayload({ evaluationWindowSec: 119 }),
    ]);

    const result = await analyzeSaasReferenceVideo({
      videoUrl: 'https://cdn.example.com/reference.mp4',
      frameImageUrls: frameUrls(),
      durationSec: 181,
      sourceLabel: 'Lovable-style product demo',
      script: 'Open with product pain, then show dashboard.',
      brandContext: 'Insturix uses dark editorial UI with gold accents.',
      gateModel: 'glm-gate',
      analysisModel: 'glm-analysis',
      client,
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.evaluationWindowSec : undefined).toBe(120);
    expect(result.ok ? result.analysis.evaluationWindowSec : undefined).toBe(120);
    expect(client.analyzeJson).toHaveBeenCalledTimes(2);

    const analysisRequest = client.analyzeJson.mock.calls[1]![0];
    expect(analysisRequest.model).toBe('glm-analysis');
    expect(analysisRequest.cacheKey).toContain('saas-reference-v1:analysis:');
    const userMessage = analysisRequest.messages[1]!;
    expect(Array.isArray(userMessage.content)).toBe(true);
    expect(userMessage.content).toEqual(
      expect.arrayContaining([{ type: 'video_url', video_url: { url: 'https://cdn.example.com/reference.mp4' } }]),
    );
    expect(JSON.stringify(userMessage.content)).toContain('first 120s only');
  });

  it('builds stable cache keys and evenly spaced frame schedules', () => {
    const input = {
      videoUrl: 'https://cdn.example.com/reference.mp4',
      frameImageUrls: frameUrls(),
      durationSec: 300,
      script: 'demo script',
      brandContext: 'brand',
    };

    expect(getReferenceEvaluationWindowSec(300)).toBe(120);
    expect(buildGateFrameSchedule(300)).toEqual([0, 29.88, 59.75, 89.63, 119.5]);
    expect(buildReferenceVideoCacheKey(input, 'analysis', 'glm-analysis')).toBe(
      buildReferenceVideoCacheKey(input, 'analysis', 'glm-analysis'),
    );
  });
});

function scriptedClient(outputs: unknown[]) {
  const queue = [...outputs];
  const analyzeJson = vi.fn(async (request: GlmVisionJsonRequest): Promise<GlmVisionJsonResult> => ({
    ok: true,
    json: queue.shift() ?? {},
    content: '{}',
    raw: {},
    model: request.model ?? 'glm-test',
    cacheKey: request.cacheKey,
  }));

  return { analyzeJson } satisfies GlmVisionJsonClient & { analyzeJson: typeof analyzeJson };
}

function frameUrls(): string[] {
  return Array.from({ length: 5 }, (_unused, index) => `https://cdn.example.com/frame-${index}.jpg`);
}

function frameVerdict(frameIndex: number, isSaasFrame: boolean) {
  return {
    frameIndex,
    isSaasFrame,
    confidence: isSaasFrame ? 0.94 : 0.2,
    evidence: isSaasFrame ? ['visible SaaS dashboard UI'] : ['no product UI visible'],
  };
}

function gatePayload(overrides: Partial<SaasReferenceGate> = {}): SaasReferenceGate {
  return {
    isSaasVideo: true,
    confidence: 0.94,
    category: 'saas_product_demo',
    evidence: ['dashboard UI', 'workflow labels', 'product CTA'],
    rejectionReasons: [],
    sampledFrameVerdicts: [
      frameVerdict(0, true),
      frameVerdict(1, true),
      frameVerdict(2, true),
      frameVerdict(3, true),
      frameVerdict(4, true),
    ],
    ...overrides,
  };
}

function analysisPayload(overrides: Partial<ReturnType<typeof baseAnalysisPayload>> = {}) {
  return {
    ...baseAnalysisPayload(),
    ...overrides,
  };
}

function baseAnalysisPayload() {
  return {
    summary: 'A focused SaaS product demo with dashboard-led proof.',
    saasCategory: 'saas_product_demo',
    evaluationWindowSec: 120,
    structure: {
      hook: 'Starts with the product value prop over UI.',
      demoFlow: ['problem', 'workflow', 'proof', 'CTA'],
      proofMoments: ['dashboard state change'],
      cta: 'Try the product',
    },
    styleSignals: {
      pacing: {
        speed: 'medium',
        cutRhythm: 'Short UI-led beats with pauses on proof screens.',
        attentionPattern: 'Alternates text claims with interface evidence.',
      },
      visualLanguage: ['dark canvas', 'precise product closeups'],
      uiTreatment: {
        density: 'balanced',
        framing: 'Centered app surfaces with generous margins.',
        screenshotTreatment: 'Clean screen captures with subtle depth.',
      },
      typography: {
        weight: 'medium to bold',
        hierarchy: 'Large claim, smaller product labels.',
        motion: 'Soft fades and small slides.',
      },
      color: {
        palette: ['#0B0B0A', '#D4A652'],
        contrast: 'High contrast editorial UI.',
        backgroundTreatment: 'Dark neutral canvas.',
      },
      motion: {
        transitionStyle: 'Clean cuts and gentle pushes.',
        cameraMoves: ['slow push'],
        microInteractions: ['cursorless UI changes'],
      },
      brandTransferBoundaries: ['Do not copy exact app layout or claims.'],
    },
    decisionInputs: ['Use dark editorial pacing as context only.'],
    risks: [],
  };
}
