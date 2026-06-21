export interface EdlParamContractContext {
  canvasWidth?: number;
  technique?: unknown;
}

export function normalizeEdlDecisionParams(
  type: string,
  params: Record<string, unknown> | undefined,
  context: EdlParamContractContext = {},
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...(params ?? {}) };

  switch (type) {
    case 'speed-change':
      return normalizeSpeedParams(normalized);
    case 'camera-shake':
      return normalizeCameraShakeParams(normalized, context);
    case 'caption-emphasis':
      return normalizeCaptionEmphasisParams(normalized);
    case 'sfx':
    case 'sfx-trigger':
      return normalizeSfxParams(normalized, context);
    default:
      return normalized;
  }
}

function normalizeSpeedParams(params: Record<string, unknown>): Record<string, unknown> {
  const speedTo = numericParam(params.speedTo)
    ?? speedFactor(params.speedMultiplier)
    ?? speedFactor(params.speed);
  if (speedTo === undefined) return params;

  const normalizedSpeedTo = clamp(speedTo, 0.1, 10);
  return {
    ...params,
    speedMultiplier: numericParam(params.speedMultiplier) ?? normalizedSpeedTo,
    speedFrom: numericParam(params.speedFrom) ?? 1,
    speedTo: normalizedSpeedTo,
    speedBack: numericParam(params.speedBack) ?? 1,
  };
}

function normalizeCameraShakeParams(
  params: Record<string, unknown>,
  context: EdlParamContractContext,
): Record<string, unknown> {
  if (numericParam(params.intensity) !== undefined) return params;

  const px = numericParam(params.intensity_px)
    ?? numericParam(params.intensityPx)
    ?? pixelValue(params.displacement)
    ?? pixelValue(params.maxOffsetPx);
  if (px === undefined) return params;

  const canvasWidth = Math.max(1, Number(context.canvasWidth ?? 1920));
  return {
    ...params,
    intensity: clamp(px / (canvasWidth * 0.01), 0.02, 1),
  };
}

function normalizeCaptionEmphasisParams(params: Record<string, unknown>): Record<string, unknown> {
  const emphasisWord = stringParam(params.emphasisWord)
    ?? stringParam(params.targetWord)
    ?? stringParam(params.word)
    ?? stringParam(params.keyword)
    ?? stringParam(params.phrase)
    ?? stringParam(params.text);
  if (!emphasisWord) return params;

  return {
    ...params,
    emphasisWord,
    emphasisType: stringParam(params.emphasisType) ?? 'keyword',
    emphasisScale: numericParam(params.emphasisScale) ?? numericParam(params.scale),
    accentColor: stringParam(params.accentColor) ?? stringParam(params.accent_color),
  };
}

function normalizeSfxParams(
  params: Record<string, unknown>,
  context: EdlParamContractContext,
): Record<string, unknown> {
  const token = sfxToken(
    stringParam(params.sfxType)
      ?? stringParam(params.type)
      ?? stringParam(params.sfxCue)
      ?? stringParam(context.technique),
  );
  if (!token) return params;

  return {
    ...params,
    sfxType: token,
    sfxCue: stringParam(params.sfxCue) ?? token,
  };
}

function speedFactor(value: unknown): number | undefined {
  const direct = numericParam(value);
  if (direct !== undefined) return direct;
  const text = stringParam(value)?.toLowerCase();
  if (!text) return undefined;

  const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent?.[1]) return Number(percent[1]) / 100;

  const xFactor = text.match(/(\d+(?:\.\d+)?)\s*x\b/);
  if (xFactor?.[1]) return Number(xFactor[1]);

  return undefined;
}

function pixelValue(value: unknown): number | undefined {
  const direct = numericParam(value);
  if (direct !== undefined) return direct;
  const text = stringParam(value)?.toLowerCase();
  if (!text) return undefined;

  const matches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*px/g))
    .map((match) => Number(match[1]))
    .filter((num) => Number.isFinite(num));
  if (matches.length === 0) return undefined;
  return matches.reduce((sum, num) => sum + num, 0) / matches.length;
}

function sfxToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .toLowerCase()
    .replace(/^technique:sound\./, '')
    .replace(/^sound\./, '')
    .replace(/^sfx[_-]/, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (/\b(whoosh|swoosh|swish|whip|sweep|swoop)\b/.test(normalized)) return 'whoosh';
  if (/\b(impact|hit|boom|thud|slam|punch|drop|bass)\b/.test(normalized)) return 'impact';
  if (/\b(shimmer|sparkle|shine|glint|magic|twinkle)\b/.test(normalized)) return 'shimmer';
  if (/\b(click|tick|ding|beep|blip|chime|notification|snap)\b/.test(normalized)) return 'tick';
  if (/\b(riser|rise|swell|build|reverse cymbal|cymbal)\b/.test(normalized)) return 'riser';
  if (/\b(ambient|room tone|roomtone|traffic|wind|rain|ocean|waves|forest|crowd|chatter|hum|tone)\b/.test(normalized)) return 'ambient';
  if (/\b(footstep|rustle|cloth|paper|door|cup|glass|keyboard|typing|breath|gasp)\b/.test(normalized)) return 'foley';
  return undefined;
}

function numericParam(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
