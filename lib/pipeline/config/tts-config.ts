/**
 * TTS Configuration and Constants
 * Shared between client and server.
 */

export interface TTSVoice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  style: string;
  previewText: string;
  provider: 'kokoro' | 'deepgram';
  /** Kokoro voice ID (e.g., 'af_heart') or Deepgram model (e.g., 'aura-asteria-en') */
  providerVoiceId: string;
}

/** Available voices — Kokoro first (more human), Deepgram as extras */
export const TTS_VOICES: TTSVoice[] = [
  // Kokoro voices (primary — more natural/human-sounding)
  { id: 'kokoro-heart', name: 'Heart', gender: 'female', style: 'Warm, natural', previewText: 'Welcome to your story. Every scene tells something unique.', provider: 'kokoro', providerVoiceId: 'af_heart' },
  { id: 'kokoro-bella', name: 'Bella', gender: 'female', style: 'Confident, clear', previewText: 'This is your vision, brought to life through words and motion.', provider: 'kokoro', providerVoiceId: 'af_bella' },
  { id: 'kokoro-nova', name: 'Nova', gender: 'female', style: 'Bright, professional', previewText: 'Let me take you on a journey through this narrative.', provider: 'kokoro', providerVoiceId: 'af_nova' },
  { id: 'kokoro-sarah', name: 'Sarah', gender: 'female', style: 'Calm, soothing', previewText: 'In every frame, there is a story waiting to be told.', provider: 'kokoro', providerVoiceId: 'af_sarah' },
  { id: 'kokoro-jessica', name: 'Jessica', gender: 'female', style: 'Energetic, friendly', previewText: 'Hey there! Let me walk you through what we have here.', provider: 'kokoro', providerVoiceId: 'af_jessica' },
  { id: 'kokoro-adam', name: 'Adam', gender: 'male', style: 'Deep, narrative', previewText: 'From the first frame to the last, this is your story.', provider: 'kokoro', providerVoiceId: 'am_adam' },
  { id: 'kokoro-michael', name: 'Michael', gender: 'male', style: 'Authoritative, bold', previewText: 'Bold ideas deserve bold presentation. Let us begin.', provider: 'kokoro', providerVoiceId: 'am_michael' },
  { id: 'kokoro-eric', name: 'Eric', gender: 'male', style: 'Warm, conversational', previewText: 'Every second counts. Let us make each moment matter.', provider: 'kokoro', providerVoiceId: 'am_eric' },
  { id: 'kokoro-liam', name: 'Liam', gender: 'male', style: 'Clear, polished', previewText: 'Precision and clarity define the quality of narration.', provider: 'kokoro', providerVoiceId: 'am_liam' },
  { id: 'kokoro-fenrir', name: 'Fenrir', gender: 'male', style: 'Rich, dramatic', previewText: 'In the realm of visual storytelling, every detail matters.', provider: 'kokoro', providerVoiceId: 'am_fenrir' },

  // Deepgram fallback (hidden from UI by default, used internally)
  { id: 'aura-asteria-en', name: 'Asteria', gender: 'female', style: 'Clear, neutral', previewText: 'I am here to provide a reliable fallback for your narration.', provider: 'deepgram', providerVoiceId: 'aura-asteria-en' },
];

export const TTS_SPEED_MAP: Record<string, number> = {
  dramatic: 110 / 150,
  narration: 140 / 150,
  conversational: 150 / 150,
  energetic: 170 / 150,
  'rapid-fire': 190 / 150,
  social: 190 / 150,
};

export const TTS_PACING_OPTIONS = [
  { id: 'dramatic', label: 'Dramatic (Slow)', wpm: 110 },
  { id: 'narration', label: 'Narration (Normal)', wpm: 140 },
  { id: 'conversational', label: 'Conversational', wpm: 150 },
  { id: 'energetic', label: 'Energetic (Fast)', wpm: 170 },
  { id: 'social', label: 'Social/Rapid (Very Fast)', wpm: 190 },
];
