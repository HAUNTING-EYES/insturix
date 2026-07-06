export interface ChatterboxVoiceReferenceInput {
  sourceType: string;
  assetId?: string;
  voiceProfileId?: string;
  url?: string;
}

export interface ChatterboxSynthesizeInput {
  model?: string;
  text: string;
  language?: string;
  voiceReference: ChatterboxVoiceReferenceInput;
  output?: Record<string, unknown>;
  /** Owner id used to namespace the generated WAV in storage. */
  userId?: string;
}

export interface ChatterboxSynthesizeResult {
  audioUrl: string;
  audioAssetId?: string;
  providerRequestId?: string;
  raw: Record<string, unknown>;
}

export interface ChatterboxClient {
  synthesize(input: ChatterboxSynthesizeInput): Promise<ChatterboxSynthesizeResult>;
}

/** Persist generated WAV bytes and return a playable URL. */
export type ChatterboxAudioUploader = (
  wav: Buffer,
  userId: string,
  filename: string,
) => Promise<{ audioUrl: string; audioAssetId?: string }>;

export interface ChatterboxClientDeps {
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to the project upload service. */
  uploadAudio?: ChatterboxAudioUploader;
}

// Chatterbox is a self-hosted FastAPI service. It clones a voice from a sample
// and returns audio/wav bytes. We also keep wrapper JSON support for deployments
// that normalize Chatterbox behind a /synthesize-style endpoint.
export function createDefaultChatterboxClient(
  env: Record<string, string | undefined> = process.env,
  deps: ChatterboxClientDeps = {},
): ChatterboxClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const uploadAudio = deps.uploadAudio ?? defaultUploadAudio;

  return {
    async synthesize(input) {
      const endpoint = env.CHATTERBOX_TTS_ENDPOINT?.trim();
      if (!endpoint) {
        throw new Error('CHATTERBOX_TTS_ENDPOINT is required to synthesize avatar voiceover.');
      }
      const text = input.text?.trim();
      if (!text) {
        throw new Error('Chatterbox synthesis requires script text.');
      }
      if (shouldUseJsonWrapper(endpoint, env)) {
        return synthesizeWithJsonWrapper(endpoint, input, env, fetchImpl);
      }

      return synthesizeWithRawChatterbox(endpoint, input, env, fetchImpl, uploadAudio);
    },
  };
}

async function synthesizeWithRawChatterbox(
  endpoint: string,
  input: ChatterboxSynthesizeInput,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  uploadAudio: ChatterboxAudioUploader,
): Promise<ChatterboxSynthesizeResult> {
  const sampleUrl = input.voiceReference.url?.trim();
  if (!sampleUrl) {
    throw new Error('Chatterbox voice cloning requires a fetchable voice sample URL (voiceReference.url).');
  }

  const sampleResponse = await fetchImpl(sampleUrl);
  if (!sampleResponse.ok) {
    throw new Error(`Failed to download voice sample (HTTP ${sampleResponse.status}) from ${sampleUrl}.`);
  }
  const sampleBytes = Buffer.from(await sampleResponse.arrayBuffer());
  const sampleType = (sampleResponse.headers.get('content-type')?.split(';')[0]?.trim() || 'audio/wav').toLowerCase();
  if (sampleBytes.length === 0) {
    throw new Error(`Voice sample at ${sampleUrl} was empty.`);
  }
  if (sampleBytes.length > MAX_VOICE_SAMPLE_BYTES) {
    const mb = (sampleBytes.length / 1024 / 1024).toFixed(1);
    throw new Error(`Voice sample is ${mb}MB; Chatterbox needs a clip under 10MB (10-30s of clean speech).`);
  }
  if (sampleType.startsWith('text/') || looksLikeHtml(sampleBytes)) {
    throw new Error(
      `Voice sample URL returned a web page, not audio (content-type: ${sampleType}). `
      + 'A Google Drive share link returns a virus-scan warning page for larger files, use a direct file link.',
    );
  }

  const form = new FormData();
  form.append('input', input.text.trim());
  form.append('voice_file', new Blob([sampleBytes as unknown as BlobPart], { type: sampleType }), voiceSampleFilename(sampleType));

  const speechUrl = chatterboxSpeechUrl(endpoint);
  const speechResponse = await fetchImpl(speechUrl, {
    method: 'POST',
    body: form,
    headers: authHeaders(env),
  });
  if (!speechResponse.ok) {
    const detail = await speechResponse.text().catch(() => '');
    throw new Error(`Chatterbox voice synthesis failed with HTTP ${speechResponse.status}: ${detail || 'no response body'}`);
  }

  const wavBytes = Buffer.from(await speechResponse.arrayBuffer());
  if (wavBytes.length === 0) {
    throw new Error('Chatterbox returned an empty audio response.');
  }

  const userId = input.userId?.trim() || 'avatar-voice';
  const uploaded = await uploadAudio(wavBytes, userId, 'avatar-voice.wav');

  return {
    audioUrl: uploaded.audioUrl,
    audioAssetId: uploaded.audioAssetId,
    raw: { bytes: wavBytes.length, sampleContentType: sampleType, speechUrl },
  };
}

async function synthesizeWithJsonWrapper(
  endpoint: string,
  input: ChatterboxSynthesizeInput,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
): Promise<ChatterboxSynthesizeResult> {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(env),
    },
    body: JSON.stringify({
      model: input.model,
      text: input.text,
      language: input.language,
      voiceReference: input.voiceReference,
      output: input.output,
      userId: input.userId,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Chatterbox wrapper failed with HTTP ${response.status}: ${detail || 'no response body'}`);
  }

  const payload = await response.json().catch(() => null);
  const payloadRecord = isRecord(payload) ? payload : undefined;
  const dataRecord = isRecord(payloadRecord?.data) ? payloadRecord.data : undefined;
  const audioRecord = isRecord(payloadRecord?.audio) ? payloadRecord.audio : undefined;
  const dataAudioRecord = isRecord(dataRecord?.audio) ? dataRecord.audio : undefined;
  const outputRecord = isRecord(payloadRecord?.output) ? payloadRecord.output : undefined;

  const audioUrl = stringValue(payloadRecord?.audioUrl)
    ?? stringValue(payloadRecord?.audio_url)
    ?? stringValue(payloadRecord?.url)
    ?? stringValue(dataRecord?.audioUrl)
    ?? stringValue(dataRecord?.audio_url)
    ?? stringValue(dataAudioRecord?.url)
    ?? stringValue(audioRecord?.url)
    ?? stringValue(outputRecord?.url);

  if (!audioUrl) {
    throw new Error('Chatterbox wrapper did not return an audioUrl.');
  }

  return {
    audioUrl,
    audioAssetId: stringValue(payloadRecord?.audioAssetId)
      ?? stringValue(payloadRecord?.audio_asset_id)
      ?? stringValue(dataRecord?.audioAssetId),
    providerRequestId: stringValue(payloadRecord?.providerRequestId)
      ?? stringValue(payloadRecord?.provider_request_id)
      ?? stringValue(payloadRecord?.requestId),
    raw: payloadRecord ?? { payload },
  };
}

const defaultUploadAudio: ChatterboxAudioUploader = async (wav, userId, filename) => {
  // Lazy import: only pull the R2/GCS upload stack when we actually synthesize.
  const { uploadMedia } = await import('@/lib/editron/services/upload-service');
  const result = await uploadMedia(wav, userId, filename, 'audio/wav');
  return { audioUrl: result.signedUrl, audioAssetId: result.assetId };
};

function chatterboxSpeechUrl(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, '');
  return base.endsWith('/v1/audio/speech') ? base : `${base}/v1/audio/speech`;
}

const MAX_VOICE_SAMPLE_BYTES = 10 * 1024 * 1024; // Chatterbox caps clones at ~10MB.

function looksLikeHtml(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

function voiceSampleFilename(contentType: string): string {
  const type = contentType.toLowerCase();
  if (type.includes('mpeg') || type.includes('mp3')) return 'voice-sample.mp3';
  if (type.includes('webm')) return 'voice-sample.webm';
  if (type.includes('ogg')) return 'voice-sample.ogg';
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'voice-sample.m4a';
  return 'voice-sample.wav';
}

function authHeaders(env: Record<string, string | undefined>): Record<string, string> {
  const apiKey = env.CHATTERBOX_TTS_API_KEY?.trim() ?? env.CHATTERBOX_API_KEY?.trim();
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function shouldUseJsonWrapper(endpoint: string, env: Record<string, string | undefined>): boolean {
  const mode = env.CHATTERBOX_TTS_MODE?.trim().toLowerCase();
  if (mode === 'json' || mode === 'wrapper_json') return true;
  if (mode === 'raw' || mode === 'chatterbox_raw') return false;
  return /\/synthesize\/?$/i.test(endpoint);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
