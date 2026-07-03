import type {
  Phase0FixtureManifest,
  Phase0FixtureProject,
  Phase0OverlayLike,
} from './phase0-fixture-manifest';

export const PHASE0_RENDER_ARTIFACT_PACK_VERSION = 'editron-phase0-render-artifact-pack-v1' as const;

type JsonRecord = Record<string, unknown>;

type AuditedEvidenceKind = 'visual' | 'motion' | 'audio';
type AuditedFamily = 'motion-graphic' | 'caption' | 'transition' | 'zoom' | 'sfx' | 'voiceover' | 'media' | 'shape' | 'text';

interface AuditedOverlayType {
  type: string;
  family: AuditedFamily;
  evidenceKind: AuditedEvidenceKind;
}

interface VideoAttachedZoomEvidence {
  overlay: Phase0OverlayLike;
  id: string;
  frame: number;
  durationInFrames: number;
  issues: string[];
}

const AUDITED_OVERLAY_TYPES: AuditedOverlayType[] = [
  { type: 'generated-scene', family: 'motion-graphic', evidenceKind: 'visual' },
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
const NON_MG_COMPLETENESS_FAMILIES = ['caption', 'transition', 'zoom', 'sfx'] as const;

export interface BuildPhase0RenderArtifactPackOptions {
  artifactDir: string;
  maxSamples?: number;
}

export interface Phase0RenderSample {
  frame: number;
  roles: string[];
  sourceOverlayIds: string[];
  sourceOverlayTypes: string[];
  sourceFamilies: string[];
  evidenceKinds: AuditedEvidenceKind[];
}

export interface Phase0RenderSamplePlan {
  maxSamples: number;
  sampledFrames: number[];
  droppedSampleCount: number;
  samples: Phase0RenderSample[];
}

export interface Phase0RenderInput {
  projectId: string;
  tag: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  sampleFrames?: number[];
  samplePlan?: Phase0RenderSamplePlan;
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
  samplePlan: Phase0RenderSamplePlan;
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
    evidenceCompleteness: Record<string, {
      count: number;
      auditableCount: number;
      issues: string[];
      sampleOverlayIds: string[];
    }>;
    incompleteFamilies: string[];
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
  const samplePlan = planPhase0RenderSamples(
    overlays,
    durationInFrames,
    options.maxSamples ?? 24,
  );
  const issues = [
    ...(width > 0 && height > 0 ? [] : ['missing-canvas-dimensions']),
    ...(durationInFrames > 0 ? [] : ['missing-duration']),
    ...(familyCoverage.auditedVisualCount > 0 ? [] : ['no-audited-visual-overlays']),
    ...familyCoverage.incompleteFamilies.map((family) => `incomplete-${family}-evidence`),
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
      sampleFrames: samplePlan.sampledFrames,
      samplePlan,
      overlays,
    },
    samplePlan,
    familyCoverage,
  };
}

function planPhase0RenderSamples(
  overlays: Phase0OverlayLike[],
  durationInFrames: number,
  maxSamples: number,
): Phase0RenderArtifactPack['samplePlan'] {
  const specsByType = new Map(AUDITED_OVERLAY_TYPES.map((spec) => [spec.type, spec]));
  const zoomSpec = specsByType.get('zoom');
  const samples = new Map<number, Phase0RenderSample>();
  const boundedMaxSamples = Math.max(1, Math.floor(maxSamples));

  for (const overlay of overlays) {
    const spec = auditedOverlaySpec(overlay, specsByType);
    if (!spec) continue;
    const from = readFrame(overlay.from);
    const duration = Math.max(1, firstPositiveNumber(overlay.durationInFrames));
    if (from < 0 || durationInFrames <= 0) continue;

    if (spec.family === 'transition') {
      addSample(samples, from, durationInFrames, 'transition-boundary', overlay, spec);
    }
    if (spec.family === 'sfx') {
      addSample(samples, sfxSyncFrameOf(overlay), durationInFrames, 'sfx-sync', overlay, spec);
    }

    addSample(samples, from + Math.min(duration - 1, Math.max(1, Math.min(8, Math.floor(duration * 0.22)))), durationInFrames, 'entry-settle', overlay, spec);
    addSample(samples, from + Math.floor(duration * 0.55), durationInFrames, 'hold', overlay, spec);
    addSample(samples, from + Math.max(0, duration - Math.max(2, Math.min(8, Math.floor(duration * 0.18)))), durationInFrames, 'exit-prep', overlay, spec);
  }
  if (zoomSpec) {
    for (const zoom of collectVideoAttachedZoomEvidence(overlays)) {
      addSample(samples, zoom.frame, durationInFrames, 'zoom-anchor', zoom.overlay, zoomSpec);
      addSample(samples, zoom.frame + Math.max(1, Math.floor(zoom.durationInFrames * 0.5)), durationInFrames, 'zoom-motion', zoom.overlay, zoomSpec);
    }
  }

  const sorted = [...samples.values()].sort((a, b) => a.frame - b.frame);
  const selected = sorted.length <= boundedMaxSamples ? sorted : selectEvenlySpacedSamples(sorted, boundedMaxSamples);
  return {
    maxSamples: boundedMaxSamples,
    sampledFrames: selected.map((sample) => sample.frame),
    droppedSampleCount: Math.max(0, sorted.length - selected.length),
    samples: selected,
  };
}

function addSample(
  samples: Map<number, Phase0RenderSample>,
  frame: number,
  durationInFrames: number,
  role: string,
  overlay: Phase0OverlayLike,
  spec: AuditedOverlayType,
): void {
  const clampedFrame = clampFrame(frame, durationInFrames);
  const existing = samples.get(clampedFrame);
  const id = overlayId(overlay);
  const type = String(overlay.type ?? 'unknown');
  if (existing) {
    existing.roles = uniqueStrings([...existing.roles, role]);
    existing.sourceOverlayIds = uniqueStrings([...existing.sourceOverlayIds, id]);
    existing.sourceOverlayTypes = uniqueStrings([...existing.sourceOverlayTypes, type]);
    existing.sourceFamilies = uniqueStrings([...existing.sourceFamilies, spec.family]);
    existing.evidenceKinds = uniqueEvidenceKinds([...existing.evidenceKinds, spec.evidenceKind]);
    return;
  }

  samples.set(clampedFrame, {
    frame: clampedFrame,
    roles: [role],
    sourceOverlayIds: [id],
    sourceOverlayTypes: [type],
    sourceFamilies: [spec.family],
    evidenceKinds: [spec.evidenceKind],
  });
}

function selectEvenlySpacedSamples(samples: Phase0RenderSample[], maxSamples: number): Phase0RenderSample[] {
  const selectedFrames = new Set<number>();
  for (let i = 0; i < maxSamples; i += 1) {
    const index = Math.round((i * (samples.length - 1)) / Math.max(1, maxSamples - 1));
    selectedFrames.add(samples[index].frame);
  }
  return samples.filter((sample) => selectedFrames.has(sample.frame));
}

function summarizeFamilyCoverage(overlays: Phase0OverlayLike[]) {
  const specsByType = new Map(AUDITED_OVERLAY_TYPES.map((spec) => [spec.type, spec]));
  const videoAttachedZooms = collectVideoAttachedZoomEvidence(overlays);
  const auditedOverlays = overlays.filter((overlay) => Boolean(auditedOverlaySpec(overlay, specsByType)));
  const counts = overlays.reduce<Record<string, number>>((result, overlay) => {
    const type = String(overlay.type ?? 'unknown');
    if (!specsByType.has(type)) return result;
    result[type] = (result[type] ?? 0) + 1;
    return result;
  }, {});
  if (videoAttachedZooms.length > 0) {
    counts.zoom = (counts.zoom ?? 0) + videoAttachedZooms.length;
  }
  const countsByFamily = auditedOverlays.reduce<Record<string, number>>((result, overlay) => {
    const family = auditedOverlaySpec(overlay, specsByType)?.family;
    if (!family) return result;
    result[family] = (result[family] ?? 0) + 1;
    return result;
  }, {});
  if (videoAttachedZooms.length > 0) {
    countsByFamily.zoom = (countsByFamily.zoom ?? 0) + videoAttachedZooms.length;
  }
  const auditedOverlayTypes = sortedTypes(AUDITED_OVERLAY_TYPES);
  const auditedVisualTypes = sortedTypes(AUDITED_OVERLAY_TYPES.filter((spec) => spec.evidenceKind === 'visual'));
  const auditedMotionTypes = sortedTypes(AUDITED_OVERLAY_TYPES.filter((spec) => spec.evidenceKind === 'motion'));
  const auditedAudioTypes = sortedTypes(AUDITED_OVERLAY_TYPES.filter((spec) => spec.evidenceKind === 'audio'));
  const requiredFamilies = [...REQUIRED_PHASE0_FAMILIES].sort((a, b) => a.localeCompare(b));
  const presentAuditedFamilies = Object.keys(countsByFamily).sort((a, b) => a.localeCompare(b));
  const evidenceCompleteness = summarizeEvidenceCompleteness(auditedOverlays, specsByType, videoAttachedZooms);
  const incompleteFamilies = Object.entries(evidenceCompleteness)
    .filter(([, summary]) => summary.count > 0 && summary.auditableCount < summary.count)
    .map(([family]) => family)
    .sort((a, b) => a.localeCompare(b));

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
    evidenceCompleteness,
    incompleteFamilies,
  };
}

function summarizeEvidenceCompleteness(
  overlays: Phase0OverlayLike[],
  specsByType: Map<string, AuditedOverlayType>,
  videoAttachedZooms: VideoAttachedZoomEvidence[] = [],
) {
  const result: Record<string, { count: number; auditableCount: number; issues: string[]; sampleOverlayIds: string[] }> = {};
  for (const family of NON_MG_COMPLETENESS_FAMILIES) {
    result[family] = { count: 0, auditableCount: 0, issues: [], sampleOverlayIds: [] };
  }

  for (const overlay of overlays) {
    const type = String(overlay.type ?? 'unknown');
    const family = auditedOverlaySpec(overlay, specsByType)?.family;
    if (!family || !(family in result)) continue;

    const summary = result[family];
    summary.count += 1;
    const issues = overlayEvidenceIssues(overlay, family);
    if (issues.length === 0) {
      summary.auditableCount += 1;
      continue;
    }
    for (const issue of issues) {
      if (!summary.issues.includes(issue)) summary.issues.push(issue);
    }
    if (summary.sampleOverlayIds.length < 8) summary.sampleOverlayIds.push(overlayId(overlay));
  }

  for (const zoom of videoAttachedZooms) {
    const summary = result.zoom;
    summary.count += 1;
    if (zoom.issues.length === 0) {
      summary.auditableCount += 1;
      continue;
    }
    for (const issue of zoom.issues) {
      if (!summary.issues.includes(issue)) summary.issues.push(issue);
    }
    if (summary.sampleOverlayIds.length < 8) summary.sampleOverlayIds.push(zoom.id);
  }

  return result;
}

function collectVideoAttachedZoomEvidence(overlays: Phase0OverlayLike[]): VideoAttachedZoomEvidence[] {
  const zooms: VideoAttachedZoomEvidence[] = [];
  for (const overlay of overlays) {
    if (overlay.type !== 'video') continue;

    const metadata = asRecord(overlay.metadata);
    const receipts = overlayReceipts(metadata).filter((receipt) => readString(receipt.family) === 'zoom');
    const forms = [
      asRecord(metadata.atomicZoomForm),
      ...(Array.isArray(metadata.atomicZoomForms) ? metadata.atomicZoomForms.map(asRecord) : []),
    ].filter((form) => Object.keys(form).length > 0);
    const hasScaleKeyframes = hasVideoZoomKeyframes(overlay);
    if (receipts.length === 0 && forms.length === 0 && !hasScaleKeyframes) continue;

    const evidenceRecords = receipts.length > 0 ? receipts : forms.length > 0 ? forms : [{}];
    evidenceRecords.forEach((record, index) => {
      const payload = asRecord(record.payload);
      const target = asRecord(record.target);
      const overlayFrom = Math.max(0, readFrame(overlay.from));
      const localFrame = firstPositiveNumber(target.localFrame, payload.localFrame, 0);
      const frame = firstPositiveNumber(record.frame, overlayFrom + localFrame, overlayFrom, 0);
      const durationInFrames = firstPositiveNumber(
        record.durationFrames,
        payload.durationFrames,
        overlay.durationInFrames,
        1,
      );
      const issues: string[] = [];
      if (receipts.length === 0 && forms.length === 0) issues.push('missing-atomic-zoom-form');
      if (!hasScaleKeyframes) issues.push('missing-zoom-keyframes');
      zooms.push({
        overlay,
        id: `${overlayId(overlay)}:zoom-${index}`,
        frame,
        durationInFrames,
        issues,
      });
    });
  }
  return zooms;
}

function overlayReceipts(metadata: JsonRecord): JsonRecord[] {
  return [
    asRecord(metadata.atomicOverlayReceipt),
    ...(Array.isArray(metadata.atomicOverlayReceipts) ? metadata.atomicOverlayReceipts.map(asRecord) : []),
  ].filter((receipt) => Object.keys(receipt).length > 0);
}

function hasVideoZoomKeyframes(overlay: Phase0OverlayLike): boolean {
  const metadata = asRecord(overlay.metadata);
  if (Array.isArray(metadata.zoomKeyframes) && metadata.zoomKeyframes.length > 0) return true;
  if (!Array.isArray(overlay.keyframeTracks)) return false;
  return overlay.keyframeTracks.some((track) => {
    const record = asRecord(track);
    return readString(record.property) === 'scale'
      && Array.isArray(record.keyframes)
      && record.keyframes.length > 0;
  });
}

function overlayEvidenceIssues(overlay: Phase0OverlayLike, family: string): string[] {
  const issues: string[] = [];
  if (firstPositiveNumber(overlay.durationInFrames) <= 0) issues.push('missing-duration');
  if (readFrame(overlay.from) < 0) issues.push('missing-frame');

  const metadata = asRecord(overlay.metadata);
  if (family === 'caption') {
    const captions = Array.isArray(overlay.captions) ? overlay.captions : [];
    const hasCaptionText = captions.some((item) => hasText(asRecord(item)?.text) || Array.isArray(asRecord(item)?.words))
      || hasText(overlay.content)
      || hasText(overlay.text)
      || hasText(overlay.captionText);
    if (!hasCaptionText) issues.push('missing-caption-text');
    if (!metadata.atomicOverlayReceipt && !metadata.atomicOverlayForm && !metadata.evidence) {
      issues.push('missing-caption-receipt-or-evidence');
    }
  } else if (family === 'transition') {
    if (!metadata.atomicTransitionForm) issues.push('missing-atomic-transition-form');
  } else if (family === 'zoom') {
    if (!metadata.atomicZoomForm && !metadata.atomicOverlayReceipt) issues.push('missing-atomic-zoom-form');
  } else if (family === 'sfx') {
    if (!metadata.atomicSfxForm) issues.push('missing-atomic-sfx-form');
    if (!hasText(overlay.assetId) && !hasText(metadata.providerAssetId) && !hasText(metadata.sourceUrl)) {
      issues.push('missing-sfx-asset-evidence');
    }
  }

  return issues;
}

function auditedOverlaySpec(
  overlay: Phase0OverlayLike,
  specsByType: Map<string, AuditedOverlayType>,
): AuditedOverlayType | null {
  const type = String(overlay.type ?? 'unknown');
  const spec = specsByType.get(type);
  if (!spec) return null;
  if ((type === 'sound' || type === 'audio') && isVoiceoverOverlay(overlay)) {
    return { ...spec, family: 'voiceover' };
  }
  return spec;
}

function isVoiceoverOverlay(overlay: Phase0OverlayLike): boolean {
  const metadata = asRecord(overlay.metadata);
  return metadata.isVoiceover === true
    || hasText(metadata.narrationText)
    || String(overlay.assetId ?? '').startsWith('voiceover_')
    || String(overlay.content ?? '').startsWith('VO ready:')
    || String(overlay.content ?? '').startsWith('VO pending:');
}

function readFrame(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : -1;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sfxSyncFrameOf(overlay: Phase0OverlayLike): number {
  const metadata = asRecord(overlay.metadata);
  const form = asRecord(metadata.atomicSfxForm);
  const timing = asRecord(form.timing);
  return Math.max(0, Math.round(
    readNumber(timing.syncFrame)
      ?? readNumber(metadata.sfxSyncFrame)
      ?? readFrame(overlay.from),
  ));
}

function overlayId(overlay: Phase0OverlayLike): string {
  return String(overlay.id ?? `${overlay.type ?? 'unknown'}:${readFrame(overlay.from)}`);
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

function clampFrame(frame: number, durationInFrames: number): number {
  return Math.max(0, Math.min(Math.max(0, durationInFrames - 1), Math.round(frame)));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function uniqueEvidenceKinds(values: AuditedEvidenceKind[]): AuditedEvidenceKind[] {
  const order: AuditedEvidenceKind[] = ['visual', 'motion', 'audio'];
  const set = new Set(values);
  return order.filter((kind) => set.has(kind));
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
