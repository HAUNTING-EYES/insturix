import type { EditDNA } from '../services/style-transfer-service';
import {
  SAAS_REFERENCE_RUBRIC_VERSION,
  type SaasReferenceGate,
  type SaasReferenceStyleAnalysis,
} from './saas-reference-video-analyzer';

export interface SaasReferenceEditDNA extends EditDNA {
  provider: 'glm-saas-reference';
  referenceKind: 'saas';
  saasReference: {
    rubricVersion: string;
    cacheKey?: string;
    evaluationWindowSec: number;
    gate?: SaasReferenceGate;
    analysis: SaasReferenceStyleAnalysis;
    createdAt: string;
  };
}

export function mapSaasReferenceAnalysisToEditDNA(input: {
  analysis: SaasReferenceStyleAnalysis;
  sourceName?: string;
  cacheKey?: string;
  gate?: SaasReferenceGate;
  createdAt?: string;
}): SaasReferenceEditDNA {
  const { analysis } = input;
  const speed = analysis.styleSignals.pacing.speed;
  const transitionStyle = analysis.styleSignals.motion.transitionStyle;
  const colorText = [
    ...analysis.styleSignals.color.palette,
    analysis.styleSignals.color.contrast,
    analysis.styleSignals.color.backgroundTreatment,
  ].join(' ');
  const typographyText = [
    analysis.styleSignals.typography.weight,
    analysis.styleSignals.typography.motion,
  ].join(' ');

  return {
    profileId: `style_saas_${stableHash(JSON.stringify({
      summary: analysis.summary,
      sourceName: input.sourceName ?? '',
      cacheKey: input.cacheKey ?? '',
    }))}`,
    sourceName: input.sourceName || 'SaaS Reference Video',
    cutRhythm: {
      avgCutsPerMinute: speed === 'fast' ? 28 : speed === 'medium' ? 16 : 8,
      pattern: coerceCutPattern(analysis.styleSignals.pacing.cutRhythm, speed),
      avgClipDuration: speed === 'fast' ? 2.1 : speed === 'medium' ? 3.75 : 7.5,
    },
    transitions: {
      dominant: coerceTransition(transitionStyle),
      frequency: speed === 'fast' ? 35 : speed === 'medium' ? 20 : 10,
    },
    colorGrade: {
      temperature: coerceTemperature(colorText),
      saturation: coerceSaturation(colorText),
      contrast: coerceContrast(colorText),
      dominantColors: normalizePalette(analysis.styleSignals.color.palette),
    },
    textStyle: {
      fontWeight: coerceFontWeight(typographyText),
      position: 'varied',
      animation: coerceTextAnimation(typographyText),
      frequency: analysis.styleSignals.uiTreatment.density === 'dense'
        ? 'heavy'
        : analysis.styleSignals.uiTreatment.density === 'balanced'
          ? 'moderate'
          : 'minimal',
    },
    musicStyle: {
      tempo: speed === 'fast' ? 'fast' : speed === 'medium' ? 'medium' : 'slow',
      genre: 'saas product demo reference',
      energyLevel: speed === 'fast' ? 'high' : speed === 'medium' ? 'medium' : 'low',
    },
    pacing: {
      overall: speed,
      hookSpeed: speed === 'slow' ? 'medium' : 'fast',
      mainSpeed: speed,
    },
    graphicsDensity: analysis.styleSignals.uiTreatment.density === 'dense'
      ? 'heavy'
      : analysis.styleSignals.uiTreatment.density === 'balanced'
        ? 'moderate'
        : 'minimal',
    provider: 'glm-saas-reference',
    referenceKind: 'saas',
    saasReference: {
      rubricVersion: SAAS_REFERENCE_RUBRIC_VERSION,
      cacheKey: input.cacheKey,
      evaluationWindowSec: analysis.evaluationWindowSec,
      gate: input.gate,
      analysis,
      createdAt: input.createdAt ?? new Date().toISOString(),
    },
  };
}

function coerceCutPattern(
  value: string,
  speed: SaasReferenceStyleAnalysis['styleSignals']['pacing']['speed'],
): EditDNA['cutRhythm']['pattern'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('fast-slow-fast')) return 'fast-slow-fast';
  if (normalized.includes('random')) return 'random';
  if (normalized.includes('build') || normalized.includes('progress')) return 'building';
  return speed === 'fast' ? 'building' : 'steady';
}

function coerceTransition(value: string): EditDNA['transitions']['dominant'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('zoom') || normalized.includes('punch')) return 'zoom_punch';
  if (normalized.includes('slide')) return 'slide';
  if (normalized.includes('wipe')) return 'wipe';
  if (normalized.includes('fade') || normalized.includes('dissolve') || normalized.includes('blur')) return 'fade';
  return 'hard_cut';
}

function coerceTemperature(value: string): EditDNA['colorGrade']['temperature'] {
  const normalized = value.toLowerCase();
  if (/\b(warm|gold|amber|orange|yellow)\b/.test(normalized)) return 'warm';
  if (/\b(cool|blue|cyan|teal|ice)\b/.test(normalized)) return 'cool';
  return 'neutral';
}

function coerceSaturation(value: string): EditDNA['colorGrade']['saturation'] {
  const normalized = value.toLowerCase();
  if (/\b(muted|desaturat|washed|soft)\b/.test(normalized)) return 'desaturated';
  if (/\b(vivid|neon|bright|saturated)\b/.test(normalized)) return 'high';
  return 'normal';
}

function coerceContrast(value: string): EditDNA['colorGrade']['contrast'] {
  const normalized = value.toLowerCase();
  if (/\b(high contrast|sharp contrast|stark)\b/.test(normalized)) return 'high';
  if (/\b(low contrast|soft contrast)\b/.test(normalized)) return 'low';
  return 'normal';
}

function normalizePalette(values: readonly string[]): string[] {
  const hexValues = values
    .map((value) => value.trim())
    .filter((value) => /^#[0-9a-f]{6}$/i.test(value));
  return Array.from(new Set(hexValues)).slice(0, 6);
}

function coerceFontWeight(value: string): EditDNA['textStyle']['fontWeight'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('extra') || normalized.includes('black') || normalized.includes('heavy')) return 'extra-bold';
  if (normalized.includes('bold') || normalized.includes('semibold')) return 'bold';
  if (normalized.includes('light') || normalized.includes('thin')) return 'light';
  return 'normal';
}

function coerceTextAnimation(value: string): EditDNA['textStyle']['animation'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('type')) return 'typewriter';
  if (normalized.includes('pop') || normalized.includes('scale')) return 'pop';
  if (normalized.includes('slide')) return 'slide';
  if (normalized.includes('none') || normalized.includes('static')) return 'none';
  return 'fade';
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 33) ^ value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
