export interface ProsodyFormalitySegment {
  energy?: number | null;
  emotionIntensity?: number | null;
  pitchVariability?: number | null;
  stressDetected?: boolean | null;
  fillerConfidence?: number | null;
}

export interface ProsodyFormalityInput {
  segments?: ProsodyFormalitySegment[] | null;
  speakingRateWpm?: number | null;
  speechEnergy?: number | null;
  hasFace?: boolean;
}

export interface ProsodyFormalityResult {
  value: number;
  source: 'wav2vec_prosody' | 'speech_rate_prosody_fallback' | 'cold_start';
  features: {
    segmentCount: number;
    pitchVariability: number | null;
    energy: number | null;
    emotionIntensity: number | null;
    stressRate: number | null;
    fillerConfidence: number | null;
    speakingRateWpm: number | null;
  };
}

export function deriveProsodyFormality(input: ProsodyFormalityInput): ProsodyFormalityResult {
  const segments = Array.isArray(input.segments) ? input.segments.filter(Boolean) : [];
  const speakingRateWpm = finiteNumber(input.speakingRateWpm);
  const hasFace = input.hasFace === true;

  if (segments.length > 0) {
    const pitchVariability = average(segments.map((segment) => segment.pitchVariability));
    const energy = average(segments.map((segment) => segment.energy));
    const emotionIntensity = average(segments.map((segment) => segment.emotionIntensity));
    const fillerConfidence = average(segments.map((segment) => segment.fillerConfidence));
    const stressRate = segments.filter((segment) => segment.stressDetected === true).length / segments.length;

    const casualProsody =
      nullish(pitchVariability, 0.35) * 0.32 +
      nullish(energy, 0.45) * 0.24 +
      nullish(emotionIntensity, 0.35) * 0.18 +
      stressRate * 0.16 +
      nullish(fillerConfidence, 0) * 0.1;

    const slowSpeechBoost = speakingRateWpm === null ? 0 : clamp01((145 - speakingRateWpm) / 65) * 0.18;
    const fastSpeechPenalty = speakingRateWpm === null ? 0 : clamp01((speakingRateWpm - 165) / 85) * 0.1;
    const studioBoost = hasFace ? 0.03 : 0;

    return {
      value: clamp01(0.62 - casualProsody * 0.45 + slowSpeechBoost - fastSpeechPenalty + studioBoost),
      source: 'wav2vec_prosody',
      features: {
        segmentCount: segments.length,
        pitchVariability,
        energy,
        emotionIntensity,
        stressRate,
        fillerConfidence,
        speakingRateWpm,
      },
    };
  }

  const fallbackEnergy = finiteNumber(input.speechEnergy);
  if (speakingRateWpm !== null || fallbackEnergy !== null || hasFace) {
    const slowSpeechBoost = speakingRateWpm === null ? 0 : clamp01((145 - speakingRateWpm) / 65) * 0.2;
    const fastSpeechPenalty = speakingRateWpm === null ? 0 : clamp01((speakingRateWpm - 165) / 85) * 0.16;
    const energyPenalty = fallbackEnergy === null ? 0 : clamp01((fallbackEnergy - 0.35) / 0.45) * 0.12;
    const studioBoost = hasFace ? 0.03 : 0;

    return {
      value: clamp01(0.56 + slowSpeechBoost - fastSpeechPenalty - energyPenalty + studioBoost),
      source: 'speech_rate_prosody_fallback',
      features: {
        segmentCount: 0,
        pitchVariability: null,
        energy: fallbackEnergy,
        emotionIntensity: null,
        stressRate: null,
        fillerConfidence: null,
        speakingRateWpm,
      },
    };
  }

  return {
    value: 0.5,
    source: 'cold_start',
    features: {
      segmentCount: 0,
      pitchVariability: null,
      energy: null,
      emotionIntensity: null,
      stressRate: null,
      fillerConfidence: null,
      speakingRateWpm: null,
    },
  };
}

function average(values: Array<number | null | undefined>): number | null {
  const finite = values
    .map((value) => finiteNumber(value))
    .filter((value): value is number => value !== null);
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullish(value: number | null, fallback: number): number {
  return value === null ? fallback : value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
