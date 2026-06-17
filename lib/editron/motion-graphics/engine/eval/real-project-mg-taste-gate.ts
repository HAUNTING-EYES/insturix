export type RealProjectMgTasteSeverity = 'fail' | 'warn' | 'info';

export interface RealProjectMgTasteFinding {
  severity: RealProjectMgTasteSeverity;
  code: string;
  message: string;
  evidence: Record<string, unknown>;
  overlayId?: string | number;
}

export interface RealProjectMgTasteGateInput {
  projectId: string;
  fps?: number;
  durationInFrames?: number;
  width?: number;
  height?: number;
  genreParameters?: Record<string, unknown>;
  overlays: Array<Record<string, unknown>>;
}

export interface RealProjectMgTasteGateReport {
  version: 'real-project-mg-taste-gate-v1';
  status: 'pass' | 'fail';
  score: number;
  summary: {
    projectId: string;
    durationSeconds: number;
    graphicDensity: number;
    motionGraphicCount: number;
    captionCount: number;
    targetGraphicCount: number;
    minimumAcceptableGraphicCount: number;
  };
  findings: RealProjectMgTasteFinding[];
}

const LICENSES_THAT_CAN_JUSTIFY_TINY_STATS = new Set([
  'bounded-proportion',
  'comparison-relation',
  'truth-negation',
  'salience',
]);

export function evaluateRealProjectMgTasteGate(
  input: RealProjectMgTasteGateInput,
): RealProjectMgTasteGateReport {
  const fps = positiveNumber(input.fps) ?? 30;
  const durationSeconds = round2((positiveNumber(input.durationInFrames) ?? 0) / fps);
  const graphicDensity = clampNumber(numberAt(input.genreParameters, 'graphic_density') ?? 0, 0, 12);
  const motionGraphics = input.overlays
    .filter((overlay) => overlay.type === 'motion-graphic')
    .sort((a, b) => (numberAt(a, 'from') ?? 0) - (numberAt(b, 'from') ?? 0));
  const captions = input.overlays.filter((overlay) => overlay.type === 'caption');
  const targetGraphicCount = targetCountForDuration(durationSeconds, graphicDensity);
  const minimumAcceptableGraphicCount = minimumCountForTarget(durationSeconds, targetGraphicCount);
  const findings: RealProjectMgTasteFinding[] = [];

  if (motionGraphics.length < minimumAcceptableGraphicCount) {
    findings.push({
      severity: 'fail',
      code: 'mg-count-too-low',
      message: 'Real project produced too few motion graphics for its duration and graphic density.',
      evidence: {
        durationSeconds,
        graphicDensity,
        motionGraphicCount: motionGraphics.length,
        targetGraphicCount,
        minimumAcceptableGraphicCount,
      },
    });
  }

  for (const overlay of motionGraphics) {
    findings.push(...findOverlayIssues(overlay, captions, fps));
  }

  const repeatedForm = dominantRecipeForm(motionGraphics);
  if (motionGraphics.length >= 3 && repeatedForm.ratio >= 0.67) {
    findings.push({
      severity: 'fail',
      code: 'mg-form-repetition',
      message: 'Most project MGs share the same recipe form, which is a real-project variety failure.',
      evidence: repeatedForm,
    });
  }

  const failCount = findings.filter((finding) => finding.severity === 'fail').length;
  const warnCount = findings.filter((finding) => finding.severity === 'warn').length;
  return {
    version: 'real-project-mg-taste-gate-v1',
    status: failCount > 0 ? 'fail' : 'pass',
    score: round3(clampNumber(1 - failCount * 0.18 - warnCount * 0.05, 0, 1)),
    summary: {
      projectId: input.projectId,
      durationSeconds,
      graphicDensity,
      motionGraphicCount: motionGraphics.length,
      captionCount: captions.length,
      targetGraphicCount,
      minimumAcceptableGraphicCount,
    },
    findings,
  };
}

function findOverlayIssues(
  overlay: Record<string, unknown>,
  captions: Array<Record<string, unknown>>,
  fps: number,
): RealProjectMgTasteFinding[] {
  const findings: RealProjectMgTasteFinding[] = [];
  const metadata = objectAt(overlay, 'metadata');
  const recipe = objectAt(overlay, 'recipe');
  const content = objectAt(overlay, 'content') ?? {};
  const overlayId = overlay.id as string | number | undefined;

  if (metadata?.sourceType === 'edl-graphic' && !metadata.semanticMgCandidateSelection) {
    findings.push({
      severity: 'fail',
      code: 'missing-semantic-candidate-selection',
      message: 'Persisted live MG lacks semantic candidate selection metadata, so the real-project choice is not auditable.',
      overlayId,
      evidence: { sourceType: metadata.sourceType, graphicType: metadata.graphicType },
    });
  }

  if (isWeakTinyStat(content, metadata)) {
    findings.push({
      severity: 'fail',
      code: 'weak-tiny-stat-selected',
      message: 'A tiny scalar/rate stat became a standalone MG without bounded, comparison, truth, or salience license.',
      overlayId,
      evidence: {
        value: content.value,
        label: content.label,
        quantityKind: content.quantityKind ?? objectAt(content, 'semanticAtoms')?.quantity,
        licenses: selectedLicenses(metadata),
      },
    });
  }

  if (activeCaptionOverlap(overlay, captions) && isCenterOrFullFrameRecipe(recipe)) {
    findings.push({
      severity: 'fail',
      code: 'caption-active-center-stage',
      message: 'MG occupies center/full-frame stage while a caption track is active; real render needs choreography proof.',
      overlayId,
      evidence: {
        seconds: round2((numberAt(overlay, 'from') ?? 0) / fps),
        durationFrames: numberAt(overlay, 'durationInFrames'),
        recipeLayout: objectAt(recipe, 'layout'),
        activeCaptionCount: captions.length,
      },
    });
  }

  const requestedRegion = stringAt(metadata, 'placementRegion');
  const layoutPosition = stringAt(objectAt(recipe, 'layout'), 'position');
  if (requestedRegion && layoutPosition && requestedRegion !== layoutPosition && layoutPosition === 'center') {
    findings.push({
      severity: 'warn',
      code: 'placement-request-drifted-to-center',
      message: 'Placement requested a side/negative-space region but persisted recipe resolved to center.',
      overlayId,
      evidence: { requestedRegion, layoutPosition },
    });
  }

  return findings;
}

function targetCountForDuration(durationSeconds: number, graphicDensity: number): number {
  if (durationSeconds <= 0 || graphicDensity <= 0) return 0;
  return Math.max(1, Math.round((durationSeconds / 60) * graphicDensity));
}

function minimumCountForTarget(durationSeconds: number, targetGraphicCount: number): number {
  if (durationSeconds < 90) return Math.min(1, targetGraphicCount);
  return Math.max(2, Math.floor(targetGraphicCount * 0.45));
}

function isWeakTinyStat(content: Record<string, unknown>, metadata: Record<string, unknown> | null): boolean {
  const value = Math.abs(numberFromUnknown(content.value ?? content.keyword) ?? Number.NaN);
  if (!Number.isFinite(value) || value <= 0 || value >= 1) return false;
  const licenses = selectedLicenses(metadata);
  if (licenses.some((license) => LICENSES_THAT_CAN_JUSTIFY_TINY_STATS.has(license))) return false;
  const quantityKind = stringAt(content, 'quantityKind') ?? stringAt(objectAt(content, 'semanticAtoms')?.quantity, 'kind');
  return !['percentage', 'fraction', 'ratio', 'proportion'].includes(quantityKind ?? '');
}

function selectedLicenses(metadata: Record<string, unknown> | null): string[] {
  const selected = objectAt(metadata, 'semanticMgCandidateSelection')?.selectedCandidate
    ?? objectAt(metadata, 'mgExpressionAuthority')?.semanticCandidate;
  const licenses = objectAt(selected, 'licenses') ?? (selected as { licenses?: unknown } | undefined)?.licenses;
  return Array.isArray(licenses) ? licenses.filter((license): license is string => typeof license === 'string') : [];
}

function activeCaptionOverlap(overlay: Record<string, unknown>, captions: Array<Record<string, unknown>>): boolean {
  const start = numberAt(overlay, 'from') ?? 0;
  const end = start + (numberAt(overlay, 'durationInFrames') ?? 0);
  return captions.some((caption) => {
    const captionStart = numberAt(caption, 'from') ?? 0;
    const captionEnd = captionStart + (numberAt(caption, 'durationInFrames') ?? 0);
    return captionStart < end && captionEnd > start;
  });
}

function isCenterOrFullFrameRecipe(recipe: Record<string, unknown> | null): boolean {
  const layout = objectAt(recipe, 'layout');
  const position = stringAt(layout, 'position');
  const maxWidth = stringAt(layout, 'maxWidth');
  return position === 'center' || position === 'full-width-top' || position === 'full-width-bottom' || maxWidth === '100%';
}

function dominantRecipeForm(motionGraphics: Array<Record<string, unknown>>) {
  const counts: Record<string, number> = {};
  for (const overlay of motionGraphics) {
    const recipe = objectAt(overlay, 'recipe');
    const id = stringAt(recipe, 'id') ?? 'unknown';
    counts[id] = (counts[id] ?? 0) + 1;
  }
  const [form = 'none', count = 0] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [];
  return {
    form,
    count,
    total: motionGraphics.length,
    ratio: motionGraphics.length > 0 ? round3(count / motionGraphics.length) : 0,
  };
}

function objectAt(source: unknown, key: string): Record<string, unknown> | null {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const value = (source as Record<string, unknown>)[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberAt(source: unknown, key: string): number | undefined {
  if (!source || typeof source !== 'object') return undefined;
  return numberFromUnknown((source as Record<string, unknown>)[key]);
}

function stringAt(source: unknown, key: string): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = numberFromUnknown(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
