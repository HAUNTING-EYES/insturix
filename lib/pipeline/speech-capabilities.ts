import { TTS_VOICES } from './config/tts-config';

export type SpeechSynthesisProvider = 'fal-ai' | 'deepgram';
export type CanonicalSpeechLanguage = 'en' | 'hi';

export interface SpeechSynthesisCapability {
  language: CanonicalSpeechLanguage;
  displayName: 'English' | 'Hindi';
  provider: SpeechSynthesisProvider;
  model: string;
  voiceId: string;
  fallback?: {
    provider: SpeechSynthesisProvider;
    model: string;
    voiceId: string;
  };
}

export interface GeneratedSpeechCapability {
  language: CanonicalSpeechLanguage;
  displayName: 'English' | 'Hindi';
  provider: SpeechSynthesisProvider;
  model: string;
  voiceId: string;
  fallbackUsed: boolean;
}

export const KOKORO_ENGLISH_MODEL = 'fal-ai/kokoro/american-english';
export const KOKORO_HINDI_MODEL = 'fal-ai/kokoro/hindi';
export const DEEPGRAM_ENGLISH_MODEL = 'aura-asteria-en';

const HINDI_VOICE_ALIASES = new Map<string, string>([
  ['kokoro-hindi-alpha', 'hf_alpha'],
  ['kokoro-hindi-beta', 'hf_beta'],
  ['kokoro-hindi-omega', 'hm_omega'],
  ['kokoro-hindi-psi', 'hm_psi'],
  ['hf_alpha', 'hf_alpha'],
  ['hf_beta', 'hf_beta'],
  ['hm_omega', 'hm_omega'],
  ['hm_psi', 'hm_psi'],
]);

export function listSupportedSpeechLanguages(): Array<{
  language: CanonicalSpeechLanguage;
  displayName: 'English' | 'Hindi';
}> {
  return [
    { language: 'en', displayName: 'English' },
    { language: 'hi', displayName: 'Hindi' },
  ];
}

export function resolveSpeechSynthesisCapability(
  language: unknown = 'English',
  requestedVoiceId?: string | null,
): SpeechSynthesisCapability | null {
  const canonicalLanguage = normalizeSpeechLanguage(language);
  if (!canonicalLanguage) return null;

  const requestedVoice = requestedVoiceId?.trim();
  if (canonicalLanguage === 'hi') {
    const voiceId = requestedVoice
      ? HINDI_VOICE_ALIASES.get(requestedVoice.toLowerCase())
      : 'hf_alpha';
    if (!voiceId) return null;
    return {
      language: 'hi',
      displayName: 'Hindi',
      provider: 'fal-ai',
      model: KOKORO_HINDI_MODEL,
      voiceId,
    };
  }

  const configuredVoice = requestedVoice
    ? TTS_VOICES.find((voice) => (
      voice.id.toLowerCase() === requestedVoice.toLowerCase()
      || voice.providerVoiceId.toLowerCase() === requestedVoice.toLowerCase()
    ))
    : TTS_VOICES.find((voice) => voice.id === 'kokoro-heart');
  if (!configuredVoice) return null;
  if (configuredVoice.provider === 'deepgram') {
    return {
      language: 'en',
      displayName: 'English',
      provider: 'deepgram',
      model: configuredVoice.providerVoiceId,
      voiceId: configuredVoice.providerVoiceId,
    };
  }
  return {
    language: 'en',
    displayName: 'English',
    provider: 'fal-ai',
    model: KOKORO_ENGLISH_MODEL,
    voiceId: configuredVoice.providerVoiceId,
    fallback: {
      provider: 'deepgram',
      model: DEEPGRAM_ENGLISH_MODEL,
      voiceId: DEEPGRAM_ENGLISH_MODEL,
    },
  };
}

function normalizeSpeechLanguage(value: unknown): CanonicalSpeechLanguage | null {
  const normalized = String(value ?? 'English').trim().toLowerCase();
  if (['english', 'en', 'en-us', 'en-gb'].includes(normalized)) return 'en';
  if (['hindi', 'hi', 'hi-in', 'hin'].includes(normalized)) return 'hi';
  return null;
}
