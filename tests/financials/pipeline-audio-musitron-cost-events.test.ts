import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

describe('pipeline audio and Musitron provider cost telemetry', () => {
  it('records TTS voiceover and voice-preview provider spend without storing raw text', () => {
    const source = readSource('lib/pipeline/tts-service.ts');
    const helperStart = source.indexOf('async function recordPipelineTTSProviderCost');
    const helperEnd = source.indexOf('function mediaSecondsFromDurationMs', helperStart);
    const helper = source.slice(helperStart, helperEnd);

    expect(source).toContain("import { recordProviderCostEvent, type ProviderCostEventStatus } from '@/lib/financials/provider-cost-events'");
    expect(source).toContain('recordPipelineTTSProviderCost({');
    expect(source).toContain("action: 'voiceover_generation'");
    expect(source).toContain("action: 'voice_preview'");
    expect(source).toContain("provider: 'fal-ai'");
    expect(source).toContain("model: 'fal-ai/kokoro/american-english'");
    expect(source).toContain("provider: 'deepgram'");
    expect(source).toContain('audioCharacters: text.length');
    expect(source).toContain('requestCount');
    expect(source).toContain('segmentCount: segments.length');

    expect(helper).not.toContain('text:');
    expect(helper).not.toContain('prompt');
    expect(helper).not.toContain('ssml');
    expect(helper).not.toContain('audioUrl');
    expect(helper).not.toContain('apiKey');
  });

  it('records BGM CassetteAI success and failure attempts', () => {
    const source = readSource('lib/pipeline/bgm-service.ts');
    const helperStart = source.indexOf('async function recordPipelineBGMProviderCost');
    const helperEnd = source.indexOf('/**\n * Generate background music', helperStart);
    const helper = source.slice(helperStart, helperEnd);

    expect(source).toContain('recordPipelineBGMProviderCost({');
    expect(source).toContain("const model = 'cassetteai/music-generator'");
    expect(source).toContain('result = await fal.subscribe(model');
    expect(source).toContain("action: 'bgm_generation'");
    expect(source).toContain("provider: 'fal-ai'");
    expect(source).toContain("operation: 'music_generation'");
    expect(source).toContain('mediaSeconds: input.durationSec');
    expect(source).toContain("status: 'success'");
    expect(source).toContain("status: 'failed'");

    expect(helper).not.toContain('prompt');
    expect(helper).not.toContain('musicPrompt');
    expect(helper).not.toContain('audioUrl');
  });

  it('records SFX Mirelo and CassetteAI paid branches only with sanitized metadata', () => {
    const source = readSource('lib/pipeline/sfx-service.ts');
    const helperStart = source.indexOf('async function recordPipelineSFXProviderCost');
    const helperEnd = source.indexOf('/**\n * Generate a sound-effects clip', helperStart);
    const helper = source.slice(helperStart, helperEnd);

    expect(source).toContain('recordPipelineSFXProviderCost({');
    expect(source).toContain("const mireloModel = 'mirelo-ai/sfx-v1.5/video-to-audio'");
    expect(source).toContain("const cassetteModel = 'cassetteai/music-generator'");
    expect(source).toContain("providerBranch: 'mirelo_video_to_audio'");
    expect(source).toContain("providerBranch: 'cassetteai_fallback'");
    expect(source).toContain("action: 'sfx_generation'");
    expect(source).toContain("operation: 'sfx_generation'");
    expect(source).toContain('mediaSeconds: input.durationSec');
    expect(source).toContain("status: 'success'");
    expect(source).toContain("status: 'failed'");

    expect(helper).not.toContain('audioDescription');
    expect(helper).not.toContain('sfxCue');
    expect(helper).not.toContain('videoUrl');
    expect(helper).not.toContain('text_prompt');
    expect(helper).not.toContain('audioUrl');
  });

  it('records Musitron Fal music provider events from the processor route', () => {
    const source = readSource('app/api/services/musitron/processor/route.ts');
    const helperStart = source.indexOf('async function recordMusitronProviderCost');
    const helperEnd = source.indexOf('async function handler', helperStart);
    const helper = source.slice(helperStart, helperEnd);

    expect(source).toContain('recordMusitronProviderCost({');
    expect(source).toContain('idempotencyKey: input.taskId ? `musitron:music:${input.taskId}:${input.status}` : undefined');
    expect(source).toContain('const falResult = await fal.subscribe(model');
    expect(source).toContain('status: "success"');
    expect(source).toContain('status: "failed"');
    expect(source).toContain('service: "musitron"');
    expect(source).toContain('action: "music_generation"');
    expect(source).toContain('route: "/api/services/musitron/processor"');
    expect(source).toContain('provider: "fal-ai"');
    expect(source).toContain('operation: "music_generation"');
    expect(source).toContain('bytesOut: audioBuffer.length');

    expect(helper).not.toContain('lyrics');
    expect(helper).not.toContain('prompt');
    expect(helper).not.toContain('falInput');
    expect(helper).not.toContain('audioUrl');
    expect(helper).not.toContain('signedUrl');
    expect(helper).not.toContain('GOOGLE_CLOUD_CREDENTIALS');
  });
});