import type {
  Phase0FixtureManifest,
  Phase0FixtureProject,
  Phase0OverlayLike,
} from './phase0-fixture-manifest';

export const PHASE0_RENDER_ARTIFACT_PACK_VERSION = 'editron-phase0-render-artifact-pack-v1' as const;

type JsonRecord = Record<string, unknown>;

const AUDITED_VISUAL_TYPES = new Set([
  'motion-graphic',
  'text',
  'caption',
  'shape',
  'sticker',
  'image',
  'html-scene',
  'html-sticker',
  'transition',
]);

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
    auditedVisualTypes: string[];
    auditedVisualCount: number;
    counts: Record<string, number>;
    presentAuditedFamilies: string[];
    missingAuditedFamilies: string[];
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
  const counts = overlays.reduce<Record<string, number>>((result, overlay) => {
    const type = String(overlay.type ?? 'unknown');
    if (!AUDITED_VISUAL_TYPES.has(type)) return result;
    result[type] = (result[type] ?? 0) + 1;
    return result;
  }, {});
  const presentAuditedFamilies = Object.keys(counts).sort((a, b) => a.localeCompare(b));
  const auditedVisualTypes = [...AUDITED_VISUAL_TYPES].sort((a, b) => a.localeCompare(b));

  return {
    auditedVisualTypes,
    auditedVisualCount: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts,
    presentAuditedFamilies,
    missingAuditedFamilies: auditedVisualTypes.filter((type) => !counts[type]),
  };
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
