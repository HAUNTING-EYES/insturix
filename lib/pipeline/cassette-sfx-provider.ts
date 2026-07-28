export const CASSETTE_SFX_MODEL = 'cassetteai/sound-effects-generator';
export const CASSETTE_SFX_LICENSE_ID =
  `fal-ai:${CASSETTE_SFX_MODEL}:commercial-use`;

const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 30;

export interface CassetteSfxRequest {
  model: typeof CASSETTE_SFX_MODEL;
  input: {
    prompt: string;
    duration: number;
  };
}

type UnknownRecord = Record<string, unknown>;

export function buildCassetteSfxRequest(
  prompt: string,
  requestedDurationSeconds: number,
): CassetteSfxRequest {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    throw new Error('CassetteAI SFX requires a non-empty prompt');
  }
  if (!Number.isFinite(requestedDurationSeconds)) {
    throw new Error('CassetteAI SFX requires a finite duration');
  }

  return {
    model: CASSETTE_SFX_MODEL,
    input: {
      prompt: normalizedPrompt,
      duration: Math.min(
        Math.max(Math.round(requestedDurationSeconds), MIN_DURATION_SECONDS),
        MAX_DURATION_SECONDS,
      ),
    },
  };
}

export function extractCassetteSfxAudioUrl(result: unknown): string {
  const root = asRecord(result);
  const data = asRecord(root?.data) ?? root;
  const audioFile = asRecord(data?.audio_file);
  const audioUrl = nonEmptyString(audioFile?.url);

  if (!audioUrl) {
    throw new Error('CassetteAI SFX response is missing audio_file.url');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(audioUrl);
  } catch {
    throw new Error('CassetteAI SFX response contains an invalid audio_file.url');
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('CassetteAI SFX response audio_file.url must use HTTPS');
  }

  return parsedUrl.toString();
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}
