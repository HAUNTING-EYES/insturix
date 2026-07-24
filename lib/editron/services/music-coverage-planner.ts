import type { ProjectBrief } from '@/lib/editron/data/edit-profile-types';
export type MusicCoverageMode = 'none' | 'sections' | 'full';
export type MusicCoverageEnergyTier = 'low' | 'medium' | 'high';
export type MusicCoverageIntent = 'continuous-bed' | 'visual-beat' | 'energy-lift' | 'speech-gap';
export type MusicPreference = NonNullable<ProjectBrief['musicPreference']>;
export interface MusicCoverageFrameRange { startFrame: number; endFrame: number }
export interface MusicCoverageEnergyRange extends MusicCoverageFrameRange { energy: number }
export interface MusicCoverageAudioTreatment extends MusicCoverageFrameRange { treatment: 'vo' | 'music_beat' }
export type MusicCoverageSource = 'audio-treatment' | 'energy-arc' | 'speech-gap' | 'content-default' | 'user-preference' | 'authored-direction';
export interface MusicCoverageSection extends MusicCoverageFrameRange { intent: MusicCoverageIntent; energyTier: MusicCoverageEnergyTier; sources: MusicCoverageSource[] }
export interface MusicCoveragePlannerInput {
  totalFrames: number;
  fps: number;
  contentType?: string | null;
  musicPreference?: MusicPreference | null;
  authoredMusicIntent?: { coverage: 'full' | 'sections'; source: string } | null;
  speechCoverage?: number | null;
  speechSegments?: MusicCoverageFrameRange[] | null;
  energyArc?: MusicCoverageEnergyRange[] | null;
  audioTreatments?: MusicCoverageAudioTreatment[] | null;
  sourceMusic?: { detected: boolean; confidence?: number | null; reason?: string } | null;
}
export interface MusicCoveragePlan {
  version: 'music-coverage-plan-v1';
  mode: MusicCoverageMode;
  sections: MusicCoverageSection[];
  reasonCodes: string[];
  evidence: {
    contentType: string | null;
    musicPreference: MusicPreference | null;
    authoredMusicIntent: MusicCoveragePlannerInput['authoredMusicIntent'];
    sourceMusicDetected: boolean;
    sourceMusicConfidence: number | null;
    sourceMusicReason: string | null;
    speechCoverage: number | null;
    temporalEvidence: { speechSegments: number; energyRanges: number; audioTreatments: number };
    coveredFrames: number;
    coverageRatio: number;
  };
}
export class MusicCoveragePlanningError extends Error {
  constructor(public readonly code: 'INVALID_TIMELINE' | 'INVALID_MUSIC_PREFERENCE' | 'INVALID_AUTHORED_MUSIC_INTENT', message: string) {
    super(message);
    this.name = 'MusicCoveragePlanningError';
  }
}
const MUSIC_PREFERENCES = new Set<MusicPreference>(['none', 'subtle_bed', 'energetic', 'match_video']);
const FULL_CONTENT_TYPES = new Set(['ad', 'advertisement', 'cinematic', 'montage', 'music-video', 'product-demo', 'promo', 'social-ad']);
const SECTION_CONTENT_TYPES = new Set(['comedy', 'documentary', 'doc', 'vlog']);
const SPARSE_CONTENT_TYPES = new Set(['corporate', 'interview', 'podcast', 'talking-head', 'tutorial']);
// CKG music-energy tracking requires a sustained 4-second change before reacting.
const MIN_SECTION_SECONDS = 4;
const MERGE_GAP_SECONDS = 1;
const LOW_ENERGY_MAX = 0.35;
const HIGH_ENERGY_MIN = 0.6;
type CandidateSection = MusicCoverageSection & { priority: number };
export function planMusicCoverage(input: MusicCoveragePlannerInput): MusicCoveragePlan {
  const { totalFrames, fps } = validateTimeline(input);
  const contentType = normalizeContentType(input.contentType);
  const musicPreference = normalizeMusicPreference(input.musicPreference);
  const authoredMusicIntent = normalizeAuthoredMusicIntent(input.authoredMusicIntent);
  const speechSegments = normalizeRanges(input.speechSegments, totalFrames);
  const energyArc = normalizeEnergyRanges(input.energyArc, totalFrames);
  const audioTreatments = normalizeAudioTreatments(input.audioTreatments, totalFrames);
  const evidenceBase = {
    contentType,
    musicPreference,
    authoredMusicIntent,
    sourceMusicDetected: input.sourceMusic?.detected === true,
    sourceMusicConfidence: finiteUnit(input.sourceMusic?.confidence),
    sourceMusicReason: input.sourceMusic?.reason?.trim() || null,
    speechCoverage: finiteUnit(input.speechCoverage),
    temporalEvidence: {
      speechSegments: speechSegments.length,
      energyRanges: energyArc.length,
      audioTreatments: audioTreatments.length,
    },
  };
  if (musicPreference === 'none') {
    return finalizePlan('none', [], ['user-disabled'], evidenceBase, totalFrames);
  }
  if (evidenceBase.sourceMusicDetected) {
    return finalizePlan('none', [], ['source-music-present'], evidenceBase, totalFrames);
  }
  if (musicPreference === 'subtle_bed' || musicPreference === 'energetic') {
    const energyTier = musicPreference === 'subtle_bed' ? 'low' : 'high';
    return finalizePlan('full', [{
      startFrame: 0,
      endFrame: totalFrames,
      intent: 'continuous-bed',
      energyTier,
      sources: ['user-preference'],
    }], ['user-full-preference'], evidenceBase, totalFrames);
  }
  if (authoredMusicIntent?.coverage === 'full' && musicPreference !== 'match_video') {
    const sections = buildFullCoverage(totalFrames, energyArc, 'authored-direction');
    return finalizePlan('full', sections, ['authored-full-direction'], evidenceBase, totalFrames);
  }
  if (contentType && FULL_CONTENT_TYPES.has(contentType)) {
    const sections = buildFullCoverage(totalFrames, energyArc);
    return finalizePlan('full', sections, ['content-default-full'], evidenceBase, totalFrames);
  }
  const explicitBeats = audioTreatments.filter(item => item.treatment === 'music_beat');
  const mayUseComputedSections = musicPreference === 'match_video'
    || authoredMusicIntent?.coverage === 'sections'
    || !contentType
    || SECTION_CONTENT_TYPES.has(contentType);
  const candidates = buildSectionCandidates({
    totalFrames,
    fps,
    explicitBeats,
    energyArc: mayUseComputedSections ? energyArc : [],
    speechSegments: mayUseComputedSections ? speechSegments : [],
  });
  const sections = mergeCandidates(candidates, fps, totalFrames);
  if (sections.length > 0) {
    const reasonCodes = [
      ...(explicitBeats.length > 0 ? ['explicit-music-beats'] : []),
      ...(mayUseComputedSections && energyArc.length > 0 ? ['energy-arc'] : []),
      ...(mayUseComputedSections && speechSegments.length > 0 ? ['speech-gaps'] : []),
    ];
    return finalizePlan('sections', sections, reasonCodes, evidenceBase, totalFrames);
  }
  if (contentType && SPARSE_CONTENT_TYPES.has(contentType)) {
    return finalizePlan('none', [], ['speech-first-content'], evidenceBase, totalFrames);
  }
  if (authoredMusicIntent?.coverage === 'sections')
    return finalizePlan('none', [], ['authored-sections-without-temporal-evidence'], evidenceBase, totalFrames);
  return finalizePlan('none', [], ['no-licensed-sections'], evidenceBase, totalFrames);
}
function buildFullCoverage(totalFrames: number, energyArc: MusicCoverageEnergyRange[], source: MusicCoverageSource = 'content-default'): MusicCoverageSection[] {
  const energy = energyArc.length > 0
    ? energyArc.reduce((sum, range) => sum + range.energy * (range.endFrame - range.startFrame), 0)
      / energyArc.reduce((sum, range) => sum + (range.endFrame - range.startFrame), 0)
    : 0.5;
  return [{
    startFrame: 0,
    endFrame: totalFrames,
    intent: 'continuous-bed',
    energyTier: energyTier(energy),
    sources: [source],
  }];
}
function buildSectionCandidates(params: {
  totalFrames: number;
  fps: number;
  explicitBeats: MusicCoverageAudioTreatment[];
  energyArc: MusicCoverageEnergyRange[];
  speechSegments: MusicCoverageFrameRange[];
}): CandidateSection[] {
  const minimumFrames = Math.ceil(params.fps * MIN_SECTION_SECONDS);
  const candidates: CandidateSection[] = params.explicitBeats
    .filter(range => range.endFrame - range.startFrame >= minimumFrames)
    .map(range => candidate(range, 'visual-beat', 'medium', 'audio-treatment', 3));
  for (const range of params.energyArc) {
    if (range.energy < HIGH_ENERGY_MIN || range.endFrame - range.startFrame < minimumFrames) continue;
    candidates.push(candidate(range, 'energy-lift', energyTier(range.energy), 'energy-arc', 2));
  }
  for (const range of invertRanges(params.speechSegments, params.totalFrames)) {
    if (range.endFrame - range.startFrame < minimumFrames) continue;
    candidates.push(candidate(range, 'speech-gap', 'low', 'speech-gap', 1));
  }
  return candidates;
}
function mergeCandidates(
  candidates: CandidateSection[],
  fps: number,
  totalFrames: number,
): MusicCoverageSection[] {
  const mergeGap = Math.ceil(fps * MERGE_GAP_SECONDS);
  const sorted = [...candidates].sort((a, b) => a.startFrame - b.startFrame || b.priority - a.priority);
  const merged: CandidateSection[] = [];
  for (const current of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || current.startFrame > previous.endFrame + mergeGap) {
      merged.push({ ...current, sources: [...current.sources] });
      continue;
    }
    previous.endFrame = Math.min(totalFrames, Math.max(previous.endFrame, current.endFrame));
    previous.sources = [...new Set([...previous.sources, ...current.sources])];
    if (current.priority > previous.priority) {
      previous.intent = current.intent;
      previous.energyTier = current.energyTier;
      previous.priority = current.priority;
    } else if (energyRank(current.energyTier) > energyRank(previous.energyTier)) {
      previous.energyTier = current.energyTier;
    }
  }
  return merged.map(({ priority: _priority, ...section }) => section);
}
function candidate(
  range: MusicCoverageFrameRange, intent: MusicCoverageIntent, tier: MusicCoverageEnergyTier,
  source: MusicCoverageSection['sources'][number], priority: number,
): CandidateSection {
  return { ...range, intent, energyTier: tier, sources: [source], priority };
}
function invertRanges(ranges: MusicCoverageFrameRange[], totalFrames: number): MusicCoverageFrameRange[] {
  if (ranges.length === 0) return [];
  const gaps: MusicCoverageFrameRange[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.startFrame > cursor) gaps.push({ startFrame: cursor, endFrame: range.startFrame });
    cursor = Math.max(cursor, range.endFrame);
  }
  if (cursor < totalFrames) gaps.push({ startFrame: cursor, endFrame: totalFrames });
  return gaps;
}
function normalizeRanges(
  ranges: MusicCoverageFrameRange[] | null | undefined,
  totalFrames: number,
): MusicCoverageFrameRange[] {
  const normalized = (ranges ?? [])
    .map(range => normalizeRange(range, totalFrames))
    .filter((range): range is MusicCoverageFrameRange => range !== null)
    .sort((a, b) => a.startFrame - b.startFrame);
  const merged: MusicCoverageFrameRange[] = [];
  for (const range of normalized) {
    const previous = merged[merged.length - 1];
    if (!previous || range.startFrame > previous.endFrame) merged.push({ ...range });
    else previous.endFrame = Math.max(previous.endFrame, range.endFrame);
  }
  return merged;
}
function normalizeEnergyRanges(
  ranges: MusicCoverageEnergyRange[] | null | undefined,
  totalFrames: number,
): MusicCoverageEnergyRange[] {
  return (ranges ?? []).flatMap(range => {
    const normalized = normalizeRange(range, totalFrames);
    const energy = finiteUnit(range.energy);
    return normalized && energy !== null ? [{ ...normalized, energy }] : [];
  });
}
function normalizeAudioTreatments(
  ranges: MusicCoverageAudioTreatment[] | null | undefined,
  totalFrames: number,
): MusicCoverageAudioTreatment[] {
  return (ranges ?? []).flatMap(range => {
    const normalized = normalizeRange(range, totalFrames);
    return normalized && (range.treatment === 'vo' || range.treatment === 'music_beat')
      ? [{ ...normalized, treatment: range.treatment }]
      : [];
  });
}
function normalizeRange(range: MusicCoverageFrameRange, totalFrames: number): MusicCoverageFrameRange | null {
  if (!Number.isFinite(range.startFrame) || !Number.isFinite(range.endFrame)) return null;
  const startFrame = Math.max(0, Math.min(totalFrames, Math.floor(range.startFrame)));
  const endFrame = Math.max(0, Math.min(totalFrames, Math.ceil(range.endFrame)));
  return endFrame > startFrame ? { startFrame, endFrame } : null;
}
function validateTimeline(input: MusicCoveragePlannerInput): { totalFrames: number; fps: number } {
  if (!Number.isInteger(input.totalFrames) || input.totalFrames <= 0 || !Number.isFinite(input.fps) || input.fps <= 0) {
    throw new MusicCoveragePlanningError('INVALID_TIMELINE', 'Music coverage requires positive totalFrames and fps');
  }
  return { totalFrames: input.totalFrames, fps: input.fps };
}
function normalizeMusicPreference(value: MusicCoveragePlannerInput['musicPreference']): MusicPreference | null {
  if (value == null) return null;
  if (!MUSIC_PREFERENCES.has(value)) {
    throw new MusicCoveragePlanningError('INVALID_MUSIC_PREFERENCE', `Unsupported music preference: ${String(value)}`);
  }
  return value;
}
function normalizeAuthoredMusicIntent(value: MusicCoveragePlannerInput['authoredMusicIntent']) {
  if (value == null) return null;
  const source = typeof value.source === 'string' ? value.source.trim() : '';
  if ((value.coverage !== 'full' && value.coverage !== 'sections') || !source) {
    throw new MusicCoveragePlanningError('INVALID_AUTHORED_MUSIC_INTENT', 'Authored music intent requires full/sections coverage and a non-empty evidence source');
  }
  return { coverage: value.coverage, source };
}
function normalizeContentType(value: string | null | undefined): string | null {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s_]+/g, '-') || null : null;
}
function energyTier(value: number): MusicCoverageEnergyTier {
  if (value >= HIGH_ENERGY_MIN) return 'high';
  if (value <= LOW_ENERGY_MAX) return 'low';
  return 'medium';
}
function energyRank(value: MusicCoverageEnergyTier): number { return value === 'high' ? 3 : value === 'medium' ? 2 : 1; }
function finiteUnit(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}
function finalizePlan(
  mode: MusicCoverageMode,
  sections: MusicCoverageSection[],
  reasonCodes: string[],
  evidence: Omit<MusicCoveragePlan['evidence'], 'coveredFrames' | 'coverageRatio'>,
  totalFrames: number,
): MusicCoveragePlan {
  const coveredFrames = sections.reduce((sum, section) => sum + (section.endFrame - section.startFrame), 0);
  return {
    version: 'music-coverage-plan-v1',
    mode,
    sections,
    reasonCodes,
    evidence: { ...evidence, coveredFrames, coverageRatio: coveredFrames / totalFrames },
  };
}
