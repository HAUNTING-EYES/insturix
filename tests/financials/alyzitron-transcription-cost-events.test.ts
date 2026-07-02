import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Alyzitron transcription provider cost telemetry contract', () => {
  it('records Deepgram and Fal Whisper provider attempts from the transcription wrapper', () => {
    const wrapper = readRepoFile('lib/alyzitron/transcription/transcriptionService.ts');

    expect(wrapper).toContain('recordProviderCostEvent({');
    expect(wrapper).toContain('provider: "deepgram"');
    expect(wrapper).toContain('model: DEEPGRAM_OPTIONS.model');
    expect(wrapper).toContain('provider: "fal-ai"');
    expect(wrapper).toContain('model: "fal-ai/whisper"');
    expect(wrapper).toContain('operation: "transcription"');
    expect(wrapper).toContain('status: "failed"');
    expect(wrapper).toContain('units: { requestCount: 1, mediaSeconds }');
  });

  it('lets the explicit transcribe route record final charged credits after duration adjustment', () => {
    const route = readRepoFile('app/api/services/alyzitron/transcribe/route.ts');

    expect(route).toContain('recordSuccessEvent: false');
    expect(route).toContain('await recordAlyzitronTranscriptionCost({');
    expect(route).toContain('chargedCredits: creditsConsumed');
    expect(route).toContain('creditTransactionId: initialTransactionId');
    expect(route).toContain('additionalCreditTransactionId: additionalTransactionId');
    expect(route).toContain('route: "/api/services/alyzitron/transcribe"');
    expect(route).toContain('service: "alyzitron"');
    expect(route).toContain('action: "transcription"');
  });

  it('records chat-session background transcription spend without attaching fake charged credits', () => {
    const route = readRepoFile('app/api/services/alyzitron/chat-session/route.ts');

    expect(route).toContain('triggerTranscription(taskId, videoUrl, userId)');
    expect(route).toContain('route: "/api/services/alyzitron/chat-session/background-transcription"');

    const callStart = route.indexOf('const result = await transcribeAudio(deepgramUrl, {');
    const callEnd = route.indexOf('});', callStart);
    const call = route.slice(callStart, callEnd);
    expect(call).not.toContain('chargedCredits');
    expect(call).not.toContain('creditTransactionId');
  });

  it('keeps provider-cost metadata free of transcripts, signed URLs, and provider payloads', () => {
    const wrapper = readRepoFile('lib/alyzitron/transcription/transcriptionService.ts');
    const helperStart = wrapper.indexOf('async function recordTranscriptionProviderCost');
    const helperEnd = wrapper.indexOf('export async function transcribeAudio');
    const helper = wrapper.slice(helperStart, helperEnd);
    const route = readRepoFile('app/api/services/alyzitron/transcribe/route.ts');
    const routeHelper = route.slice(route.indexOf('async function recordAlyzitronTranscriptionCost'));

    for (const body of [helper, routeHelper]) {
      expect(body).not.toContain('signedUrl');
      expect(body).not.toContain('deepgramUrl');
      expect(body).not.toContain('audio_url');
      expect(body).not.toContain('formattedTranscript');
      expect(body).not.toContain('speakerSegments');
      expect(body).not.toContain('input.result.text');
      expect(body).not.toContain('result.text');
      expect(body).not.toContain('result.data');
    }
  });

  it('documents the partial T6 Alyzitron transcription telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-03: Alyzitron transcription provider events are wired');
    expect(plan).toContain('Deepgram and Fal Whisper pricing remain `pricing_to_be_seen`');
  });
});