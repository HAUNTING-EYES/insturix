import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

describe('Editron transcription provider cost events', () => {
  it('records orchestration-provider attempts for xAI, Fal, and Gemini transcription', () => {
    const source = readSource('lib/editron/services/media/transcription-service.ts');

    expect(source).toContain('recordEditronTranscriptionProviderCost');
    expect(source).toContain("provider: 'xai'");
    expect(source).toContain("model: 'grok-stt'");
    expect(source).toContain("strategy: 'grok_stt'");
    expect(source).toContain('requestCount: grokRequestCount');
    expect(source).toContain('retryCount: Math.max(grokRequestCount - 1, 0)');
    expect(source).toContain('bytesIn: grokBytesIn');

    expect(source).toContain("provider: 'fal-ai'");
    expect(source).toContain("model: 'fal-ai/wizper'");
    expect(source).toContain("strategy: 'fal_wizper'");
    expect(source).toContain('segmentCount: data.chunks.length');

    expect(source).toContain("provider: 'google-gemini'");
    expect(source).toContain("model: 'editron-analysis-model'");
    expect(source).toContain("strategy: 'gemini_transcription'");
    expect(source).toContain('bytesIn: buffer.byteLength');
  });

  it('passes sanitized media-transcription context into the Deepgram fallback', () => {
    const source = readSource('lib/editron/services/media/transcription-service.ts');

    expect(source).toContain('const result = await transcribeMedia(mediaUrl, {');
    expect(source).toContain('telemetry: {');
    expect(source).toContain("strategy: 'deepgram_fallback'");
    expect(source).toContain('assetType: asset.type');
    expect(source).toContain('assetSource: asset.source');
    expect(source).toContain('hasGcsPath: Boolean(asset.gcsPath)');
    expect(source).toContain('preferWordLevel: options?.preferWordLevel');
  });

  it('records Deepgram wrapper success and failure attempts, including direct callers', () => {
    const source = readSource('lib/editron/services/deepgram-service.ts');

    expect(source).toContain('recordEditronDeepgramCost');
    expect(source).toContain("provider: 'deepgram'");
    expect(source).toContain('model: input.model');
    expect(source).toContain("operation: 'transcription'");
    expect(source).toContain('providerAttempted = true;');
    expect(source).toContain('mediaSeconds: durationMs > 0 ? durationMs / 1000 : undefined');
    expect(source).toContain('sourceMode = \'file_upload\';');
    expect(source).toContain('sourceMode = \'remote_url\';');
    expect(source).toContain("strategy: telemetry?.strategy ?? 'deepgram_direct'");
  });

  it('keeps cost-event metadata free of media URLs, transcripts, prompts, and secrets', () => {
    const mediaSource = readSource('lib/editron/services/media/transcription-service.ts');
    const mediaHelperStart = mediaSource.indexOf('async function recordEditronTranscriptionProviderCost');
    const mediaHelperEnd = mediaSource.indexOf('/**\n * Get transcription', mediaHelperStart);
    const mediaHelper = mediaSource.slice(mediaHelperStart, mediaHelperEnd);

    const deepgramSource = readSource('lib/editron/services/deepgram-service.ts');
    const deepgramHelperStart = deepgramSource.indexOf('async function recordEditronDeepgramCost');
    const deepgramHelperEnd = deepgramSource.indexOf('/**\n * Transcribe a video/audio file URL', deepgramHelperStart);
    const deepgramHelper = deepgramSource.slice(deepgramHelperStart, deepgramHelperEnd);

    for (const helper of [mediaHelper, deepgramHelper]) {
      expect(helper).not.toContain('mediaUrl');
      expect(helper).not.toContain('audio_url');
      expect(helper).not.toContain('buffer.toString');
      expect(helper).not.toContain('xaiKey');
      expect(helper).not.toContain('falKey');
      expect(helper).not.toContain('apiKey');
      expect(helper).not.toContain('Authorization');
      expect(helper).not.toContain('payload');
      expect(helper).not.toContain('body:');
      expect(helper).not.toContain('prompt');
    }
  });

  it('documents the Editron transcription provider telemetry slice in the provider-cost plan', () => {
    const plan = readSource('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-05: Editron transcription provider events are wired');
    expect(plan).toContain('xAI/Grok STT, Fal Wizper, Gemini/Gemma transcription, and Deepgram fallback/direct-wrapper attempts');
  });
});
