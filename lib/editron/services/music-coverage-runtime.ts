import { ROW } from '@/lib/pipeline/scene-to-editron';
import { buildEditedTimelineContext, type EditedTimelineOverlayLike } from './edited-timeline-context';
import { deriveNativeAudioEvidence } from './native-audio-evidence';
import {
  MusicCoveragePlanningError,
  planMusicCoverage,
  type MusicCoverageAudioTreatment,
  type MusicCoverageEnergyRange,
  type MusicCoverageFrameRange,
  type MusicCoveragePlan,
  type MusicCoveragePlannerInput,
  type MusicPreference,
} from './music-coverage-planner';
type UnknownRecord = Record<string, unknown>;
export interface MusicCoverageSceneFrame { sceneIndex: number; fromFrame: number; durationFrames: number }
export interface RuntimeMusicCoverageInput {
  totalFrames: number;
  fps: number;
  project?: unknown;
  overlays?: unknown[];
  contentType?: string | null;
  musicPreference?: unknown;
  authoredMusicIntent?: MusicCoveragePlannerInput['authoredMusicIntent'];
  speechCoverage?: number | null;
  speechSegments?: MusicCoverageFrameRange[] | null;
  energyArc?: MusicCoverageEnergyRange[] | null;
  audioTreatments?: MusicCoverageAudioTreatment[] | null;
  sourceMusic?: MusicCoveragePlannerInput['sourceMusic'];
  storyboardScenes?: unknown[];
  sceneFrameMap?: MusicCoverageSceneFrame[];
  precomputedPlan?: unknown;
}
export interface RuntimeBgmOverlay extends UnknownRecord { id: unknown; from: number; durationInFrames: number; metadata?: UnknownRecord }
export class MusicCoverageRuntimeError extends Error {
  constructor(public readonly code: 'INVALID_PRECOMPUTED_PLAN' | 'NON_CANONICAL_SPEECH_TIMELINE', message: string) {
    super(message);
    this.name = 'MusicCoverageRuntimeError';
  }
}
const MODES = new Set(['none', 'sections', 'full']);
const MUSIC_PREFERENCES = new Set(['none', 'subtle_bed', 'energetic', 'match_video']);
const INTENTS = new Set(['continuous-bed', 'visual-beat', 'energy-lift', 'speech-gap']);
const ENERGY_TIERS = new Set(['low', 'medium', 'high']);
const SOURCES = new Set([
  'audio-treatment', 'energy-arc', 'speech-gap', 'content-default', 'user-preference', 'authored-direction',
]);
export function resolveRuntimeMusicCoveragePlan(input: RuntimeMusicCoverageInput): MusicCoveragePlan {
  if (input.precomputedPlan !== undefined) {
    return assertMusicCoveragePlan(input.precomputedPlan, input.totalFrames);
  }
  const project = record(input.project);
  const rawFootage = record(project.rawFootageAnalysis);
  const coverageContext = record(project.musicCoverageContext);
  const overlays = input.overlays ?? records(project.overlays);
  const configuredSpeechSegments = input.speechSegments ?? readFrameRanges(coverageContext.speechSegments);
  const voiceoverSegments = configuredSpeechSegments ? [] : deriveVoiceoverSegments(overlays);
  const editedSpeech = configuredSpeechSegments || voiceoverSegments.length > 0
    ? null
    : deriveEditedSpeechEvidence(rawFootage, overlays, input.totalFrames, input.fps);
  const storyboardTreatments = deriveStoryboardAudioTreatments(
    input.storyboardScenes,
    input.sceneFrameMap,
  );

  return planMusicCoverage({
    totalFrames: input.totalFrames,
    fps: input.fps,
    contentType: firstString(
      input.contentType,
      record(rawFootage.contentTypeDetection).contentType,
      record(project.syntheticStoryboard).contentType,
      coverageContext.contentType,
    ),
    musicPreference: readMusicPreference(input.musicPreference),
    authoredMusicIntent: input.authoredMusicIntent
      ?? readAuthoredMusicIntent(coverageContext.authoredMusicIntent),
    speechCoverage: firstUnit(input.speechCoverage, editedSpeech?.speechCoverage, rawFootage.speechCoverage, coverageContext.speechCoverage),
    speechSegments: configuredSpeechSegments ?? (voiceoverSegments.length > 0 ? voiceoverSegments : editedSpeech?.speechSegments),
    energyArc: input.energyArc ?? readEnergyRanges(coverageContext.energyArc),
    audioTreatments: input.audioTreatments
      ?? readAudioTreatments(coverageContext.audioTreatments)
      ?? storyboardTreatments,
    sourceMusic: input.sourceMusic ?? readSourceMusic(coverageContext.sourceMusic),
  });
}

export function buildMusicCoverageOverlays<T extends RuntimeBgmOverlay>(input: {
  baseOverlay: T;
  plan: MusicCoveragePlan;
  totalFrames: number;
  idFactory: (sectionIndex: number) => T['id'];
}): T[] {
  const plan = assertMusicCoveragePlan(input.plan, input.totalFrames);
  if (plan.mode === 'none') return [];

  const baseMetadata = record(input.baseOverlay.metadata);
  return plan.sections.map((section, sectionIndex) => ({
    ...input.baseOverlay,
    id: input.idFactory(sectionIndex),
    from: section.startFrame,
    durationInFrames: section.endFrame - section.startFrame,
    // Remotion Audio.startFrom and the editor waveform both use source frames.
    startFromSound: section.startFrame,
    metadata: {
      ...baseMetadata,
      musicCoverage: {
        version: plan.version,
        mode: plan.mode,
        sectionIndex,
        section,
        reasonCodes: plan.reasonCodes,
      },
    },
  }));
}

export function assertMusicCoveragePlan(value: unknown, totalFrames: number): MusicCoveragePlan {
  const plan = record(value);
  const sections = Array.isArray(plan.sections) ? plan.sections : null;
  const reasonCodes = Array.isArray(plan.reasonCodes) ? plan.reasonCodes : null;
  if (
    !Number.isInteger(totalFrames) || totalFrames <= 0
    || plan.version !== 'music-coverage-plan-v1'
    || typeof plan.mode !== 'string' || !MODES.has(plan.mode)
    || !sections || !reasonCodes || reasonCodes.some(reason => typeof reason !== 'string')
    || !isCoverageEvidence(plan.evidence)
  ) {
    throw invalidPlan('Music coverage plan has an invalid envelope');
  }

  let previousEnd = 0;
  let coveredFrames = 0;
  for (const rawSection of sections) {
    const section = record(rawSection);
    if (!isSection(section, totalFrames) || (section.startFrame as number) < previousEnd) {
      throw invalidPlan('Music coverage sections must be valid, ordered, and non-overlapping');
    }
    previousEnd = section.endFrame as number;
    coveredFrames += (section.endFrame as number) - (section.startFrame as number);
  }

  if (
    (plan.mode === 'none' && sections.length !== 0)
    || (plan.mode !== 'none' && sections.length === 0)
    || (plan.mode === 'full' && !coversFullTimeline(sections, totalFrames))
  ) {
    throw invalidPlan(`Music coverage mode ${plan.mode} does not match its sections`);
  }

  const evidence = record(plan.evidence);
  const expectedRatio = coveredFrames / totalFrames;
  if (
    evidence.coveredFrames !== coveredFrames
    || Math.abs((evidence.coverageRatio as number) - expectedRatio) > 1e-9
  ) {
    throw invalidPlan('Music coverage evidence does not match section coverage');
  }
  return value as MusicCoveragePlan;
}

function deriveVoiceoverSegments(overlays: unknown[]): MusicCoverageFrameRange[] {
  return records(overlays).flatMap(overlay => {
    const assetId = typeof overlay.assetId === 'string' ? overlay.assetId : '';
    const isVoiceover = overlay.type === 'sound'
      && (overlay.row === ROW.VOICEOVER || assetId.startsWith('voiceover_'));
    const from = finiteInteger(overlay.from);
    const duration = finiteInteger(overlay.durationInFrames);
    return isVoiceover && from !== null && duration !== null && duration > 0
      ? [{ startFrame: from, endFrame: from + duration }]
      : [];
  });
}

function deriveEditedSpeechEvidence(
  rawFootage: UnknownRecord,
  overlays: unknown[],
  totalFrames: number,
  fps: number,
): { speechCoverage: number; speechSegments: MusicCoverageFrameRange[] } | null {
  if (Object.keys(rawFootage).length === 0) return null;
  const context = buildEditedTimelineContext({
    rawFootage: rawFootage as Parameters<typeof buildEditedTimelineContext>[0]['rawFootage'],
    overlays: records(overlays) as unknown as EditedTimelineOverlayLike[],
    fps,
    projectDurationFrames: totalFrames,
  });
  if (!context.evidence.isCanonicalDecisionTimeline && context.evidence.inputWordCount > 0) {
    throw new MusicCoverageRuntimeError(
      'NON_CANONICAL_SPEECH_TIMELINE',
      `Music coverage cannot map ${context.evidence.inputWordCount} speech words onto the edited timeline`,
    );
  }
  const evidence = deriveNativeAudioEvidence(
    context.editedRawFootage as Parameters<typeof deriveNativeAudioEvidence>[0],
    fps,
  );
  return {
    speechCoverage: evidence.speechCoverage,
    speechSegments: evidence.speechRegions.map(region => ({
      startFrame: region.sourceStartFrame,
      endFrame: region.sourceEndFrame,
    })),
  };
}

function deriveStoryboardAudioTreatments(
  scenes: unknown[] | undefined,
  frameMap: MusicCoverageSceneFrame[] | undefined,
): MusicCoverageAudioTreatment[] | null {
  if (!Array.isArray(scenes) || !Array.isArray(frameMap)) return null;
  const framesByScene = new Map(frameMap.map(frame => [frame.sceneIndex, frame]));
  return records(scenes).flatMap(scene => {
    const descriptor = record(scene.descriptor);
    const treatment = descriptor.audioTreatment;
    const sceneIndex = finiteInteger(scene.sceneIndex);
    const frame = sceneIndex === null ? undefined : framesByScene.get(sceneIndex);
    return frame && (treatment === 'vo' || treatment === 'music_beat')
      ? [{
          startFrame: frame.fromFrame,
          endFrame: frame.fromFrame + frame.durationFrames,
          treatment,
        }]
      : [];
  });
}

function isSection(section: UnknownRecord, totalFrames: number): boolean {
  return Number.isInteger(section.startFrame)
    && Number.isInteger(section.endFrame)
    && (section.startFrame as number) >= 0
    && (section.endFrame as number) > (section.startFrame as number)
    && (section.endFrame as number) <= totalFrames
    && typeof section.intent === 'string' && INTENTS.has(section.intent)
    && typeof section.energyTier === 'string' && ENERGY_TIERS.has(section.energyTier)
    && Array.isArray(section.sources) && section.sources.length > 0
    && section.sources.every(source => typeof source === 'string' && SOURCES.has(source));
}

function isCoverageEvidence(value: unknown): boolean {
  const evidence = record(value);
  return Number.isInteger(evidence.coveredFrames)
    && typeof evidence.coverageRatio === 'number'
    && Number.isFinite(evidence.coverageRatio)
    && evidence.coverageRatio >= 0
    && evidence.coverageRatio <= 1;
}

function coversFullTimeline(sections: unknown[], totalFrames: number): boolean {
  const first = record(sections[0]);
  const last = record(sections[sections.length - 1]);
  return first.startFrame === 0 && last.endFrame === totalFrames
    && sections.every((section, index) => index === 0
      || record(sections[index - 1]).endFrame === record(section).startFrame);
}

function readAuthoredMusicIntent(value: unknown): MusicCoveragePlannerInput['authoredMusicIntent'] {
  const intent = record(value);
  return (intent.coverage === 'full' || intent.coverage === 'sections') && typeof intent.source === 'string'
    ? { coverage: intent.coverage, source: intent.source }
    : null;
}

function readMusicPreference(value: unknown): MusicPreference | null {
  if (value == null) return null;
  if (typeof value === 'string' && MUSIC_PREFERENCES.has(value)) return value as MusicPreference;
  throw new MusicCoveragePlanningError(
    'INVALID_MUSIC_PREFERENCE',
    `Unsupported runtime music preference: ${String(value)}`,
  );
}

function readSourceMusic(value: unknown): MusicCoveragePlannerInput['sourceMusic'] {
  const source = record(value);
  return typeof source.detected === 'boolean'
    ? {
        detected: source.detected,
        confidence: firstUnit(source.confidence),
        ...(typeof source.reason === 'string' ? { reason: source.reason } : {}),
      }
    : null;
}

function readFrameRanges(value: unknown): MusicCoverageFrameRange[] | null {
  return Array.isArray(value) ? records(value).flatMap(range => {
    const startFrame = finiteInteger(range.startFrame);
    const endFrame = finiteInteger(range.endFrame);
    return startFrame !== null && endFrame !== null ? [{ startFrame, endFrame }] : [];
  }) : null;
}

function readEnergyRanges(value: unknown): MusicCoverageEnergyRange[] | null {
  return Array.isArray(value) ? records(value).flatMap(range => {
    const frame = readFrameRanges([range])?.[0];
    const energy = firstUnit(range.energy);
    return frame && energy !== null ? [{ ...frame, energy }] : [];
  }) : null;
}

function readAudioTreatments(value: unknown): MusicCoverageAudioTreatment[] | null {
  return Array.isArray(value) ? records(value).flatMap(range => {
    const frame = readFrameRanges([range])?.[0];
    return frame && (range.treatment === 'vo' || range.treatment === 'music_beat')
      ? [{ ...frame, treatment: range.treatment }]
      : [];
  }) : null;
}

function firstString(...values: unknown[]): string | null {
  const value = values.find(item => typeof item === 'string' && item.trim().length > 0);
  return typeof value === 'string' ? value.trim() : null;
}

function firstUnit(...values: unknown[]): number | null {
  const value = values.find(item => typeof item === 'number' && Number.isFinite(item));
  return typeof value === 'number' ? Math.max(0, Math.min(1, value)) : null;
}

function finiteInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function invalidPlan(message: string): MusicCoverageRuntimeError {
  return new MusicCoverageRuntimeError('INVALID_PRECOMPUTED_PLAN', message);
}

export { MusicCoveragePlanningError };
