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

export function createDefaultChatterboxClient(
  env: Record<string, string | undefined> = process.env,
): ChatterboxClient {
  return {
    async synthesize(input) {
      const endpoint = env.CHATTERBOX_TTS_ENDPOINT?.trim();
      if (!endpoint) {
        throw new Error('CHATTERBOX_TTS_ENDPOINT is required to synthesize avatar voiceover.');
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(env),
        },
        body: JSON.stringify(input),
      });
      const body = await readJsonObject(response);
      if (!response.ok) {
        throw new Error(`Chatterbox voice synthesis failed with HTTP ${response.status}: ${errorText(body)}`);
      }

      const audioUrl = extractString(body, ['audioUrl'])
        ?? extractString(body, ['audio_url'])
        ?? extractString(body, ['url'])
        ?? extractString(body, ['data', 'audioUrl'])
        ?? extractString(body, ['data', 'audio_url'])
        ?? extractString(body, ['data', 'audio', 'url']);
      if (!audioUrl) {
        throw new Error('Chatterbox voice synthesis completed without an audio URL.');
      }

      return {
        audioUrl,
        audioAssetId: extractString(body, ['audioAssetId']) ?? extractString(body, ['audio_asset_id']),
        providerRequestId: extractString(body, ['requestId']) ?? extractString(body, ['request_id']),
        raw: body,
      };
    },
  };
}

function authHeaders(env: Record<string, string | undefined>): Record<string, string> {
  const apiKey = env.CHATTERBOX_TTS_API_KEY?.trim() ?? env.CHATTERBOX_API_KEY?.trim();
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function extractString(value: unknown, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' && current.trim() ? current : undefined;
}

function errorText(body: Record<string, unknown>): string {
  return extractString(body, ['error', 'message'])
    ?? extractString(body, ['error'])
    ?? extractString(body, ['message'])
    ?? 'unknown error';
}
