import type {
  Phase0FixtureManifest,
  Phase0FixtureProject,
  Phase0OverlayLike,
} from './phase0-fixture-manifest';

export const PHASE0_RENDER_ARTIFACT_PACK_VERSION = 'editron-phase0-render-artifact-pack-v1' as const;

type JsonRecord = Record<string, unknown>;

type AuditedEvidenceKind = 'visual' | 'motion' | 'audio';

interface AuditedOverlayType {
  type: string;
  family: 'motion-graphic' | 'caption' | 'transition' | 'zoom' | 'sfx' | 'media' | 'shape' | 'text';
  evidenceKind: AuditedEvidenceKind;
}

const AUDITED_OVERLAY_TYPES: AuditedOverlayType[] = [
  { type: 'motion-graphic', family: 'motion-graphic', evidenceKind: 'visual' },
  { type: 'text', family: 'text', evidenceKind: 'visual' },
  { type: 'caption', family: 'caption', evidenceKind: 'visual' },
  { type: 'shape', family: 'shape', evidenceKind: 'visual' },
  { type: 'sticker', family: 'shape', evidenceKind: 'visual' },
  { type: 'image', family: 'media', evidenceKind: 'visual' },
  { type: 'html-scene', family: 'media', evidenceKind: 'visual' },
  { type: 'html-sticker', family: 'media', evidenceKind: 'visual' },
  { type: 'transition', family: 'transition', evidenceKind: 'visual' },
  { type: 'zoom', family: 'zoom', evidenceKind: 'motion' },
  { type: 'sound', family: 'sfx', evidenceKind: 'audio' },
  { type: 'audio', family: 'sfx', evidenceKind: 'audio' },
];

const REQUIRED_PHASE0_FAMILIES = ['motion-graphic', 'caption', 'transition', 'zoom', 'sfx'] as const;

export interface BuildPhase0RenderArtifactPackOptions {
  artifactDir: string;
}

export interface Phase0RenderInput {
  projectId: string;
  tag: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  overlays: Phase0OverlayLike[];
}

export interface Phase0RenderArtifactPack {
  version: typeof PHASE0_RENDER_ARTIFACT_PACK_VERSION;
  projectId: string;
  status: 'ready' | 'not-renderable';
  issues: string[];
  artifactDir: string;
  paths: {
    renderInput: string;
    renderedAestheticDir: string;
    renderedAestheticJson: string;
    renderedAestheticHtml: string;
  };
  renderCommand: string;
  renderInput: Phase0RenderInput;
  familyCoverage: {
    auditedOverlayTypes: string[];
    auditedVisualTypes: string[];
    auditedMotionTypes: string[];
    auditedAudioTypes: string[];
    requiredFamilies: string[];
    auditedVisualCount: number;
    auditedMotionCount: number;
    auditedAudioCount: number;
    auditedOverlayCount: number;
    counts: Record<string, number>;
    countsByFamily: Record<string, number>;
    presentAuditedFamilies: string[];
    missingAuditedFamilies: string[];
    presentRequiredFamilies: string[];
    missingRequiredFamilies: string[];
  };
}

export function buildPhase0RenderArtifactPack(
  project: Phase0FixtureProject,
  manifest: Phase0FixtureManifest,
  options: BuildPhase0RenderArtifactPackOptions,
): Phase0RenderArtifactPack {
  const overlays = Array.isArray(project.overlays) ? project.overlays : [];
  const width = firstPositiveNumber(
    project.playerDimensions?.width,
    project.width,
    project.compositionWidth,
    project.canvasWidth,
    manifest.canvas.width,
  );
  const height = firstPositiveNumber(
    project.playerDimensions?.height,
    project.height,
    project.compositionHeight,
    project.canvasHeight,
    manifest.canvas.height,
  );
  const durationInFrames = firstPositiveNumber(
    manifest.durationFrames,
    project.durationInFrames,
    maxOverlayEnd(overlays),
  );
  const fps = firstPositiveNumber(manifest.fps, project.fps, 30) || 30;
  const tag = safeTag(`${manifest.projectId}-phase0`);
  const renderedAestheticDir = joinPath(options.artifactDir, 'rendered-aesthetic');
  const renderInputPath = joinPath(options.artifactDir, 'render-input.json');
  const familyCoverage = summarizeFamilyCoverage(overlays);
  const issues = [
    ...(width > 0 && height > 0 ? [] : ['missing-canvas-dimensions']),
    ...(durationInFrames > 0 ? [] : ['missing-duration']),
    ...(familyCoverage.auditedVisualCount > 0 ? [] : ['no-audited-visual-overlays']),
  ];

  return {
    version: PHASE0_RENDER_ARTIFACT_PACK_VERSION,
    projectId: manifest.projectId,
    status: issues.length === 0 ? 'ready' : 'not-renderable',
    issues,
    artifactDir: options.artifactDir,
    paths: {
      renderInput: renderInputPath,
      renderedAestheticDir,
      renderedAestheticJson: joinPath(renderedAestheticDir, 'rendered-aesthetic.json'),
      renderedAestheticHtml: joinPath(renderedAestheticDir, 'report.html'),
    },
    renderCommand: `npx tsx scripts/render-editron-aesthetic.ts "${renderInputPath}" --out="${renderedAestheticDir}" --tag="${tag}" --overlay-only`,
    renderInput: {
      projectId: manifest.projectId,
      tag,
      width,
      height,
      fps,
      durationInFrames,
      overlays,
    },
    familyCoverage,
  };
}

function summarizeFamilyCoverage(overlays: Phase0OverlayLike[]) {
  const specsByType = new Map(AUDITED_OVERLAY_TYPES.map((spec) => [spec.type, spec]));
  const counts = overlays.reduce<Record<string, number>>((result, overlay) => {
    const type = String(overlay.type ?? 'unknown');
    if (!specsByType.has(type)) return result;
    result[type] = (result[type] ?? 0) + 1;
    return result;
  }, {});
  const countsByFamily = Object.entries(counts).reduce<Record<string, number>>((result, [type, count]) => {
    const family = specsByType.get(type)?.family;
    if (!family) return result;
    result[family] = (result[family] ?? 0) + count;
    return result;
  }, {});
  const auditedOverlayTypes = sortedTypes(AUDITED_OVERLAY_TYPES);
  const auditedVisualTypes = sortedTypes(AUDITED_OVERLAY_TYPES.filter((spec) => spec.evidenceKind === 'visual'));
  const auditedMotionTypes = sortedTypes(AUDITED_OVERLAY_TYPES.filter((spec) => spec.evidenceKind === 'motion'));
  const auditedAudioTypes = sortedTypes(AUDITED_OVERLAY_TYPES.filter((spec) => spec.evidenceKind === 'audio'));
  const requiredFamilies = [...REQUIRED_PHASE0_FAMILIES].sort((a, b) => a.localeCompare(b));
  const presentAuditedFamilies = Object.keys(countsByFamily).sort((a, b) => a.localeCompare(b));

  return {
    auditedOverlayTypes,
    auditedVisualTypes,
    auditedMotionTypes,
    auditedAudioTypes,
    requiredFamilies,
    auditedVisualCount: countTypes(counts, auditedVisualTypes),
    auditedMotionCount: countTypes(counts, auditedMotionTypes),
    auditedAudioCount: countTypes(counts, auditedAudioTypes),
    auditedOverlayCount: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts,
    countsByFamily,
    presentAuditedFamilies,
    missingAuditedFamilies: requiredFamilies.filter((family) => !countsByFamily[family]),
    presentRequiredFamilies: requiredFamilies.filter((family) => countsByFamily[family]),
    missingRequiredFamilies: requiredFamilies.filter((family) => !countsByFamily[family]),
  };
}

function sortedTypes(specs: AuditedOverlayType[]): string[] {
  return specs.map((spec) => spec.type).sort((a, b) => a.localeCompare(b));
}

function countTypes(counts: Record<string, number>, types: string[]): number {
  return types.reduce((sum, type) => sum + (counts[type] ?? 0), 0);
}

function firstPositiveNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function maxOverlayEnd(overlays: Phase0OverlayLike[]): number {
  return overlays.reduce((maxEnd, overlay) => {
    const from = firstPositiveNumber(overlay.from);
    const duration = firstPositiveNumber(overlay.durationInFrames);
    return Math.max(maxEnd, from + duration);
  }, 0);
}

function safeTag(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48).toLowerCase() || 'phase0';
}

function joinPath(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}
