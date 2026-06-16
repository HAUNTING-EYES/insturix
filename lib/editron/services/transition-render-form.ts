import type { TransitionStyle } from '@/components/editron/editor/version-7.0.0/types';
import type { AtomicTransitionForm } from './transition-form';

export interface TransitionRenderParams {
  style: TransitionStyle;
  directionX: number;
  directionY: number;
  directionLabel: AtomicTransitionForm['direction']['label'];
  hasAtomicDirection: boolean;
  blurPx: number;
  softness: number;
  exposure: number;
  smear: number;
  motionDistancePct: number;
  zoomScaleDelta: number;
  flashOpacityCap: number;
}

export function isAtomicTransitionForm(value: unknown): value is AtomicTransitionForm {
  if (!value || typeof value !== 'object') return false;
  const form = value as Partial<AtomicTransitionForm>;
  return form.version === 'atomic-transition-form-v1'
    && typeof form.compatibilityType === 'string'
    && !!form.direction
    && typeof form.direction === 'object';
}

export function resolveTransitionRenderStyle(
  fallbackStyle: TransitionStyle,
  form?: AtomicTransitionForm,
): TransitionStyle {
  return form?.compatibilityType || fallbackStyle;
}

export function resolveTransitionRenderParams(
  style: TransitionStyle,
  form?: AtomicTransitionForm,
): TransitionRenderParams {
  const direction = resolveDirectionUnit(style, form);
  const intensity = clamp01(form?.intensity ?? defaultIntensity(style));
  const blurPx = clampNumber(form?.blurPx ?? defaultBlurPx(style), 0, 48);
  const smear = clamp01(form?.smear ?? defaultSmear(style));
  const exposure = clamp01(form?.exposure ?? defaultExposure(style));
  const softness = clamp01(form?.softness ?? defaultSoftness(style));

  return {
    style,
    directionX: direction.x,
    directionY: direction.y,
    directionLabel: direction.label,
    hasAtomicDirection: !!form && form.direction.axis !== 'none',
    blurPx,
    softness,
    exposure,
    smear,
    motionDistancePct: Math.round(90 + smear * 70 + intensity * 20),
    zoomScaleDelta: clampNumber(form ? 0.12 + intensity * 0.24 : 0.3, 0.08, 0.42),
    flashOpacityCap: clampNumber(form ? 0.35 + exposure * 0.65 : 1, 0.25, 1),
  };
}

export function resolveDirectionalWipeClipPath(
  progress: number,
  params: TransitionRenderParams,
  fallbackLabel: TransitionRenderParams['directionLabel'],
): string {
  const label = params.hasAtomicDirection ? params.directionLabel : fallbackLabel;
  const remaining = (1 - progress) * 100;

  switch (label) {
    case 'right':
      return `inset(0 0 0 ${remaining}%)`;
    case 'up':
      return `inset(0 0 ${remaining}% 0)`;
    case 'down':
      return `inset(${remaining}% 0 0 0)`;
    case 'left':
    case 'center':
    default:
      return `inset(0 ${remaining}% 0 0)`;
  }
}

function resolveDirectionUnit(style: TransitionStyle, form?: AtomicTransitionForm): {
  x: number;
  y: number;
  label: AtomicTransitionForm['direction']['label'];
} {
  if (form?.direction.axis === 'x') {
    return {
      x: form.direction.x >= 0 ? 1 : -1,
      y: 0,
      label: form.direction.label,
    };
  }

  if (form?.direction.axis === 'y') {
    return {
      x: 0,
      y: form.direction.y >= 0 ? 1 : -1,
      label: form.direction.label,
    };
  }

  if (style === 'slide-up') return { x: 0, y: 1, label: 'up' };
  if (style === 'slide-down') return { x: 0, y: -1, label: 'down' };
  return { x: 1, y: 0, label: 'left' };
}

function defaultBlurPx(style: TransitionStyle): number {
  if (style === 'whip-pan') return 30;
  if (style === 'blur-transition') return 20;
  if (style === 'soft-cut') return 3;
  return 0;
}

function defaultSmear(style: TransitionStyle): number {
  return style === 'whip-pan' ? 0.43 : 0;
}

function defaultExposure(style: TransitionStyle): number {
  return style === 'flash' ? 1 : 0;
}

function defaultSoftness(style: TransitionStyle): number {
  if (style === 'dissolve' || style === 'soft-cut' || style === 'blur-transition') return 0.5;
  return 0.25;
}

function defaultIntensity(style: TransitionStyle): number {
  if (style === 'whip-pan' || style === 'zoom-punch' || style === 'flash') return 0.7;
  return 0.35;
}

function clamp01(value: number): number {
  return clampNumber(value, 0, 1);
}

function clampNumber(value: number, min: number, max: number): number {
  if (!isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
