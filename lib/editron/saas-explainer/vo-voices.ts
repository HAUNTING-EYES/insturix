/**
 * SaaS Explainer — VO voice catalog.
 *
 * Curated set of edge-tts neural voices (free, synthesized by glm-voice-fit.py). The chosen id flows:
 * finalize route → job.voice → worker sets EXPLAINER_VOICE env → glm-voice-fit.py. Cloned brand voices are a
 * later upgrade (avatar voice-clone pipeline); this covers the picker for now.
 */
export interface VoOption {
  id: string;
  label: string;
  gender: 'female' | 'male';
  accent: 'US' | 'UK' | 'AU';
  description: string;
}

export const VO_VOICES: VoOption[] = [
  { id: 'en-US-AvaNeural', label: 'Ava', gender: 'female', accent: 'US', description: 'Warm, natural, premium — the default.' },
  { id: 'en-US-AndrewNeural', label: 'Andrew', gender: 'male', accent: 'US', description: 'Warm, confident, conversational.' },
  { id: 'en-US-EmmaNeural', label: 'Emma', gender: 'female', accent: 'US', description: 'Friendly, casual, upbeat.' },
  { id: 'en-US-BrianNeural', label: 'Brian', gender: 'male', accent: 'US', description: 'Relaxed, approachable, modern.' },
  { id: 'en-US-GuyNeural', label: 'Guy', gender: 'male', accent: 'US', description: 'Clear, newscaster, authoritative.' },
  { id: 'en-US-JennyNeural', label: 'Jenny', gender: 'female', accent: 'US', description: 'Assistant-clear, neutral, trustworthy.' },
  { id: 'en-US-AriaNeural', label: 'Aria', gender: 'female', accent: 'US', description: 'Positive, energetic, marketing.' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia', gender: 'female', accent: 'UK', description: 'British, poised, editorial.' },
  { id: 'en-GB-RyanNeural', label: 'Ryan', gender: 'male', accent: 'UK', description: 'British, calm, professional.' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha', gender: 'female', accent: 'AU', description: 'Australian, bright, friendly.' },
];

export const DEFAULT_VOICE = 'en-US-AvaNeural';

export function isValidVoice(id: string): boolean {
  return VO_VOICES.some((v) => v.id === id);
}

/** Return a valid voice id (falls back to the default for unknown/empty input). */
export function resolveVoice(id?: string): string {
  return id && isValidVoice(id) ? id : DEFAULT_VOICE;
}
