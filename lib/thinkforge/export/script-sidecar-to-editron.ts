import type { SceneDescriptor } from '@/lib/pipeline/schemas/storyboard';
import {
  readScriptSidecar,
  type ScriptSidecarReadResult,
} from '@/lib/thinkforge/schemas/script-sidecar-v1-adapter';
import {
  getCanonicalBeatSpokenText,
  SCRIPT_SIDECAR_V2_VERSION,
  type NarrativeBeatV2,
  type NarrativeSceneV2,
  type ProviderRenderSegmentV2,
  type ScriptSidecarV2,
} from '@/lib/thinkforge/schemas/script-sidecar-v2';
import { SCRIPT_SIDECAR_VERSION, type ScriptSidecar } from '@/lib/thinkforge/schemas/script-sidecar';
import {
  projectThinkForgeAuthoringProvenance,
  type ThinkForgeAuthoringProvenance,
} from '@/lib/thinkforge/context/brand-authoring-context';

export const THINKFORGE_EDITRON_HANDOFF_VERSION = 1 as const;
export const THINKFORGE_EDITRON_SIDECAR_COMPILATION_VERSION = 1 as const;

export type ThinkForgeEditronDurationSource =
  | 'legacy-v1'
  | 'narrative-scene'
  | 'narrative-beats'
  | 'render-segments';

export interface ThinkForgeEditronSceneBinding {
  sceneIndex: number;
  actId: string;
  narrativeSceneId: string;
  beatIds: string[];
  lineIds: string[];
  sourceRefs: string[];
  renderSegmentIds: string[];
  durationSource: ThinkForgeEditronDurationSource;
}

export interface ThinkForgeEditronSidecarCompilation {
  version: typeof THINKFORGE_EDITRON_SIDECAR_COMPILATION_VERSION;
  sourceSidecarVersion: typeof SCRIPT_SIDECAR_VERSION | typeof SCRIPT_SIDECAR_V2_VERSION;
  canonicalSidecarVersion: typeof SCRIPT_SIDECAR_V2_VERSION;
  spokenTextSource: 'beat-lines';
  narrativeSidecar: ScriptSidecarV2;
  sceneBindings: ThinkForgeEditronSceneBinding[];
}

export interface ThinkForgeEditronHandoffContext {
  version: typeof THINKFORGE_EDITRON_HANDOFF_VERSION;
  authoringProvenance?: ThinkForgeAuthoringProvenance;
  briefSnapshot?: Record<string, unknown>;
  sourceLedger?: Record<string, unknown>;
  sidecarSourceRefs: string[];
  sidecarCompilation?: ThinkForgeEditronSidecarCompilation;
  avatarDirectives: ThinkForgeAvatarSceneDirective[];
}

export interface ThinkForgeAvatarSceneDirective {
  sceneIndex: number;
  durationSeconds: number;
  relipSafe?: boolean;
  speakers: Array<{
    characterId: string;
    avatarProfileId?: string;
    voiceMode: 'cloned' | 'preset' | 'none' | 'unbound';
    lineText: string;
    sourceRefs?: string[];
  }>;
}

export interface ScriptSidecarEditronExport {
  sidecarVersion: number;
  sidecarCompilation: ThinkForgeEditronSidecarCompilation;
  scenes: SceneDescriptor[];
  overallMusicPrompt: string;
  characterDescriptions: Record<string, string>;
  colorPalette: string[];
  environmentNotes: string;
  globalEditDirections: Record<string, unknown> | undefined;
  suggestedProfileCategory: string;
}

export type ThinkForgeSidecarCompilationErrorCode =
  | 'invalid-sidecar'
  | 'compiler-invariant'
  | 'scene-duration-unresolved'
  | 'scene-visual-intent-missing';

export class ThinkForgeSidecarCompilationError extends Error {
  readonly code: ThinkForgeSidecarCompilationErrorCode;
  readonly claimedVersion?: number;
  readonly originalError?: unknown;

  constructor(input: {
    code: ThinkForgeSidecarCompilationErrorCode;
    message: string;
    claimedVersion?: number;
    originalError?: unknown;
  }) {
    super(input.message);
    this.name = 'ThinkForgeSidecarCompilationError';
    this.code = input.code;
    this.claimedVersion = input.claimedVersion;
    this.originalError = input.originalError;
  }
}

interface FlattenedNarrativeScene {
  actId: string;
  scene: NarrativeSceneV2;
  sceneIndex: number;
}

interface CompiledSidecar {
  readResult: ScriptSidecarReadResult;
  scenes: SceneDescriptor[];
  sidecarCompilation: ThinkForgeEditronSidecarCompilation;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function declaredSidecarVersion(value: unknown): number | undefined {
  const version = asRecord(value)?.sidecarVersion;
  return typeof version === 'number' && Number.isInteger(version) ? version : undefined;
}

function flattenNarrativeScenes(sidecar: ScriptSidecarV2): FlattenedNarrativeScene[] {
  let sceneIndex = 0;
  return sidecar.acts.flatMap((act) => act.narrativeScenes.map((scene) => ({
    actId: act.id,
    scene,
    sceneIndex: sceneIndex++,
  })));
}

function renderSegmentsForScene(
  sidecar: ScriptSidecarV2,
  sceneId: string,
): ProviderRenderSegmentV2[] {
  return sidecar.renderPlan?.renderSegments.filter(
    (segment) => segment.narrativeSceneId === sceneId,
  ) ?? [];
}

function renderSegmentsCoverLine(
  line: NarrativeBeatV2['lines'][number],
  renderSegments: ProviderRenderSegmentV2[],
): boolean {
  if (line.text.length === 0) return true;
  const spans = renderSegments
    .flatMap((segment) => segment.lineSpans)
    .filter((span) => span.lineId === line.id)
    .sort((left, right) => left.startOffsetUtf16 - right.startOffsetUtf16);
  let coveredUntil = 0;
  for (const span of spans) {
    if (span.startOffsetUtf16 > coveredUntil) return false;
    coveredUntil = Math.max(coveredUntil, span.endOffsetUtf16);
  }
  return coveredUntil >= line.text.length;
}

function renderSegmentsCoverScene(
  scene: NarrativeSceneV2,
  renderSegments: ProviderRenderSegmentV2[],
): boolean {
  return scene.beats.every((beat) => {
    const beatSegments = renderSegments.filter((segment) => segment.beatId === beat.id);
    if (beatSegments.length === 0) return false;
    return beat.lines
      .filter((line) => line.delivery !== 'on-screen-text')
      .every((line) => renderSegmentsCoverLine(line, beatSegments));
  });
}

function resolveV2SceneDuration(
  claimedVersion: number,
  scene: NarrativeSceneV2,
  renderSegments: ProviderRenderSegmentV2[],
): { durationSeconds: number; source: Exclude<ThinkForgeEditronDurationSource, 'legacy-v1'> } {
  if (scene.durationIntentSeconds !== undefined) {
    return { durationSeconds: scene.durationIntentSeconds, source: 'narrative-scene' };
  }

  if (scene.beats.every((beat) => beat.durationIntentSeconds !== undefined)) {
    return {
      durationSeconds: scene.beats.reduce((total, beat) => total + (beat.durationIntentSeconds ?? 0), 0),
      source: 'narrative-beats',
    };
  }

  if (renderSegmentsCoverScene(scene, renderSegments)) {
    return {
      durationSeconds: renderSegments.reduce((total, segment) => total + segment.durationSeconds, 0),
      source: 'render-segments',
    };
  }

  throw new ThinkForgeSidecarCompilationError({
    code: 'scene-duration-unresolved',
    claimedVersion,
    message: `Narrative scene "${scene.id}" has no complete duration evidence.`,
  });
}

function describeShotIntent(beat: NarrativeBeatV2): string | undefined {
  const intent = beat.shotIntent;
  if (!intent) return undefined;
  return [
    intent.visualPriority,
    `Action: ${intent.action}.`,
    `Framing: ${intent.desiredFraming}.`,
    `Angle: ${intent.desiredAngle}.`,
    `Camera: ${intent.desiredMovement}${intent.movementMotivation ? ` (${intent.movementMotivation})` : ''}.`,
  ].join(' ');
}

function beatVisualDescription(
  claimedVersion: number,
  scene: NarrativeSceneV2,
  beat: NarrativeBeatV2,
): string {
  const description = beat.visualIntent?.description ?? describeShotIntent(beat);
  if (description) return description;
  throw new ThinkForgeSidecarCompilationError({
    code: 'scene-visual-intent-missing',
    claimedVersion,
    message: `Narrative beat "${beat.id}" in scene "${scene.id}" has no visual or shot intent.`,
  });
}

function collectBeatText(
  beats: NarrativeBeatV2[],
  select: (beat: NarrativeBeatV2) => string | undefined,
): string {
  return beats.map(select).filter((value): value is string => Boolean(value?.trim())).join('\n\n');
}

function collectOnScreenText(beats: NarrativeBeatV2[]): string[] {
  return beats.flatMap((beat) => [
    ...(beat.visualIntent?.onScreenText ?? []),
    ...beat.lines.filter((line) => line.delivery === 'on-screen-text').map((line) => line.text),
  ]);
}

function uniformAssetRecommendation(
  beats: NarrativeBeatV2[],
): SceneDescriptor['assetRecommendation'] | undefined {
  const recommendations = beats.map((beat) => beat.visualIntent?.assetRecommendation);
  if (recommendations.some((recommendation) => recommendation === undefined)) return undefined;
  const unique = new Set(recommendations);
  return unique.size === 1 ? recommendations[0] : undefined;
}

function compileV2Scenes(
  sidecar: ScriptSidecarV2,
  claimedVersion: number,
): { scenes: SceneDescriptor[]; durationSources: ThinkForgeEditronDurationSource[] } {
  const durationSources: ThinkForgeEditronDurationSource[] = [];
  const scenes = flattenNarrativeScenes(sidecar).map(({ scene, sceneIndex }) => {
    const renderSegments = renderSegmentsForScene(sidecar, scene.id);
    const duration = resolveV2SceneDuration(claimedVersion, scene, renderSegments);
    durationSources.push(duration.source);
    const onScreenText = collectOnScreenText(scene.beats);
    const cameraDirection = collectBeatText(scene.beats, describeShotIntent);
    const assetRecommendation = uniformAssetRecommendation(scene.beats);

    return {
      sceneIndex,
      title: scene.title,
      narration: scene.beats
        .map(getCanonicalBeatSpokenText)
        .filter(Boolean)
        .join('\n\n'),
      visualDescription: scene.beats
        .map((beat) => beatVisualDescription(claimedVersion, scene, beat))
        .join('\n\n'),
      durationSeconds: duration.durationSeconds,
      mood: scene.mood ?? '',
      ...(cameraDirection ? { cameraDirection } : {}),
      videoMotionPrompt: collectBeatText(
        scene.beats,
        (beat) => beat.visualIntent?.motion ?? (beat.shotIntent
          ? `${beat.shotIntent.desiredMovement}${beat.shotIntent.movementMotivation
            ? `: ${beat.shotIntent.movementMotivation}`
            : ''}`
          : undefined),
      ),
      audioDescription: collectBeatText(scene.beats, (beat) => beat.audioIntent?.ambience),
      musicDescription: collectBeatText(scene.beats, (beat) => beat.audioIntent?.music),
      sfxDescription: scene.beats.flatMap((beat) => beat.audioIntent?.sfx ?? []).join('\n\n'),
      imageQualityTokens: collectBeatText(scene.beats, (beat) => beat.visualIntent?.imageQualityTokens),
      videoQualityTokens: collectBeatText(scene.beats, (beat) => beat.visualIntent?.videoQualityTokens),
      ...(onScreenText.length > 0 ? { editDirections: { onScreenText } } : {}),
      ...(assetRecommendation ? { assetRecommendation } : {}),
    } satisfies SceneDescriptor;
  });
  return { scenes, durationSources };
}

function mapLegacyV1Scenes(sidecar: ScriptSidecar): SceneDescriptor[] {
  return sidecar.scenes.map((scene, sceneIndex) => ({
    sceneIndex,
    title: scene.title,
    narration: scene.narration,
    visualDescription: scene.visualDescription,
    videoMotionPrompt: scene.videoMotionPrompt,
    audioDescription: scene.audioDescription,
    musicDescription: scene.musicDescription,
    sfxDescription: scene.sfxDescription,
    durationSeconds: scene.durationSeconds,
    mood: scene.mood,
    imageQualityTokens: scene.imageQualityTokens,
    videoQualityTokens: scene.videoQualityTokens,
    editDirections: scene.editDirections as SceneDescriptor['editDirections'],
    generationUnitId: scene.generationUnitId,
    primaryVisualForUnit: scene.primaryVisualForUnit,
    ...(scene.subShots ? { subShots: scene.subShots as SceneDescriptor['subShots'] } : {}),
    sceneType: scene.sceneType,
    assetRecommendation: scene.assetRecommendation,
  }));
}

function buildSidecarCompilation(
  readResult: ScriptSidecarReadResult,
  durationSources: ThinkForgeEditronDurationSource[],
): ThinkForgeEditronSidecarCompilation {
  const flattenedScenes = flattenNarrativeScenes(readResult.sidecar);
  if (durationSources.length !== flattenedScenes.length) {
    throw new ThinkForgeSidecarCompilationError({
      code: 'compiler-invariant',
      claimedVersion: readResult.sourceVersion,
      message: 'Compiled scene duration evidence does not match the narrative scene count.',
    });
  }
  return {
    version: THINKFORGE_EDITRON_SIDECAR_COMPILATION_VERSION,
    sourceSidecarVersion: readResult.sourceVersion,
    canonicalSidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
    spokenTextSource: 'beat-lines',
    narrativeSidecar: readResult.sidecar,
    sceneBindings: flattenedScenes.map(({ actId, scene, sceneIndex }) => ({
      sceneIndex,
      actId,
      narrativeSceneId: scene.id,
      beatIds: scene.beats.map((beat) => beat.id),
      lineIds: scene.beats.flatMap((beat) => beat.lines.map((line) => line.id)),
      sourceRefs: [...scene.sourceRefs],
      renderSegmentIds: renderSegmentsForScene(readResult.sidecar, scene.id).map((segment) => segment.id),
      durationSource: durationSources[sceneIndex]!,
    })),
  };
}

function compileScriptSidecar(input: unknown): CompiledSidecar {
  const claimedVersion = declaredSidecarVersion(input);
  let readResult: ScriptSidecarReadResult;
  try {
    readResult = readScriptSidecar(input);
  } catch (error) {
    throw new ThinkForgeSidecarCompilationError({
      code: 'invalid-sidecar',
      claimedVersion,
      message: `Script sidecar validation failed${claimedVersion ? ` for version ${claimedVersion}` : ''}.`,
      originalError: error,
    });
  }

  const compiled = readResult.sourceVersion === SCRIPT_SIDECAR_VERSION
    ? {
        scenes: mapLegacyV1Scenes(readResult.legacyV1),
        durationSources: readResult.legacyV1.scenes.map(() => 'legacy-v1' as const),
      }
    : compileV2Scenes(readResult.sidecar, claimedVersion ?? SCRIPT_SIDECAR_V2_VERSION);

  return {
    readResult,
    scenes: compiled.scenes,
    sidecarCompilation: buildSidecarCompilation(readResult, compiled.durationSources),
  };
}

function sanitizeBriefSnapshotForEditron(value: unknown): Record<string, unknown> | undefined {
  const brief = asRecord(value);
  if (!brief) return undefined;
  const casting = asRecord(brief.casting);
  const map = asRecord(casting?.map);
  if (!map) return brief;

  const sanitizedMap = Object.fromEntries(Object.entries(map).map(([characterId, rawBinding]) => {
    const binding = asRecord(rawBinding);
    const voice = asRecord(binding?.voice);
    const sanitizedVoice = voice ? { mode: resolveVoiceMode(voice) } : undefined;
    return [
      characterId,
      {
        ...(typeof binding?.avatarProfileId === 'string' ? { avatarProfileId: binding.avatarProfileId } : {}),
        ...(sanitizedVoice ? { voice: sanitizedVoice } : {}),
      },
    ];
  }));

  return { ...brief, casting: { ...casting, map: sanitizedMap } };
}

function resolveVoiceMode(voice: Record<string, unknown> | null | undefined): 'cloned' | 'preset' | 'none' | 'unbound' {
  if (voice?.mode === 'cloned' || voice?.mode === 'preset' || voice?.mode === 'none') return voice.mode;
  return 'unbound';
}

function buildAvatarDirectives(
  compiled: CompiledSidecar,
  castingMap: Record<string, unknown> | undefined,
): ThinkForgeAvatarSceneDirective[] {
  if (compiled.readResult.sourceVersion === SCRIPT_SIDECAR_VERSION) {
    return compiled.readResult.legacyV1.scenes
      .map((scene, sceneIndex) => {
        const speakers = scene.lines
          .filter((line) => line.onCamera && line.delivery === 'sync-dialogue')
          .map((line) => {
            const casting = asRecord(castingMap?.[line.speakerId]);
            return {
              characterId: line.speakerId,
              ...(typeof casting?.avatarProfileId === 'string' ? { avatarProfileId: casting.avatarProfileId } : {}),
              voiceMode: resolveVoiceMode(asRecord(casting?.voice)),
              lineText: line.text,
              ...(line.sourceRefs ? { sourceRefs: [...line.sourceRefs] } : {}),
            };
          });
        return speakers.length > 0
          ? {
              sceneIndex,
              durationSeconds: scene.durationSeconds,
              ...(typeof scene.relipSafe === 'boolean' ? { relipSafe: scene.relipSafe } : {}),
              speakers,
            }
          : null;
      })
      .filter((directive): directive is ThinkForgeAvatarSceneDirective => directive !== null);
  }

  return flattenNarrativeScenes(compiled.readResult.sidecar)
    .map(({ scene, sceneIndex }) => {
      const speakers = scene.beats
        .flatMap((beat) => beat.lines)
        .filter((line) => line.onCamera && line.delivery === 'sync-dialogue' && Boolean(line.speakerId))
        .map((line) => {
          const characterId = line.speakerId as string;
          const casting = asRecord(castingMap?.[characterId]);
          return {
            characterId,
            ...(typeof casting?.avatarProfileId === 'string' ? { avatarProfileId: casting.avatarProfileId } : {}),
            voiceMode: resolveVoiceMode(asRecord(casting?.voice)),
            lineText: line.text,
            ...(line.sourceRefs.length > 0 ? { sourceRefs: [...line.sourceRefs] } : {}),
          };
        });
      return speakers.length > 0
        ? {
            sceneIndex,
            durationSeconds: compiled.scenes[sceneIndex]!.durationSeconds,
            speakers,
          }
        : null;
    })
    .filter((directive): directive is ThinkForgeAvatarSceneDirective => directive !== null);
}

/** Preserve server-resolved ThinkForge context for the downstream Editron seam. */
export function buildThinkForgeEditronHandoffContext(input: {
  sidecar?: unknown;
  briefSnapshot?: unknown;
  sourceLedger?: unknown;
  authoringContextSnapshot?: unknown;
  expectedBrandId?: string;
}): ThinkForgeEditronHandoffContext {
  const compiled = input.sidecar === undefined ? null : compileScriptSidecar(input.sidecar);
  const briefSnapshot = sanitizeBriefSnapshotForEditron(input.briefSnapshot);
  const sourceLedger = asRecord(input.sourceLedger);
  const authoringProvenance = projectThinkForgeAuthoringProvenance({
    snapshot: input.authoringContextSnapshot,
    expectedBrandId: input.expectedBrandId,
  });
  const castingMap = asRecord(asRecord(briefSnapshot?.casting)?.map);

  return {
    version: THINKFORGE_EDITRON_HANDOFF_VERSION,
    ...(authoringProvenance ? { authoringProvenance } : {}),
    ...(briefSnapshot ? { briefSnapshot } : {}),
    ...(sourceLedger ? { sourceLedger } : {}),
    sidecarSourceRefs: compiled ? [...compiled.readResult.sidecar.sourceRefs] : [],
    ...(compiled ? { sidecarCompilation: compiled.sidecarCompilation } : {}),
    avatarDirectives: compiled ? buildAvatarDirectives(compiled, castingMap) : [],
  };
}

/**
 * Compile a validated V1 or V2 writer sidecar into Editron's current scene contract.
 * Narrative hierarchy remains intact in sidecarCompilation; render segments never
 * become narrative scenes or replace canonical beat-line text.
 */
export function mapScriptSidecarToEditronExport(input: unknown): ScriptSidecarEditronExport {
  const compiled = compileScriptSidecar(input);
  const creativeDirection = compiled.readResult.sidecar.creativeDirection;
  const legacyV1 = compiled.readResult.sourceVersion === SCRIPT_SIDECAR_VERSION
    ? compiled.readResult.legacyV1
    : undefined;

  return {
    sidecarVersion: compiled.readResult.sourceVersion,
    sidecarCompilation: compiled.sidecarCompilation,
    scenes: compiled.scenes,
    overallMusicPrompt: legacyV1?.overallMusicPrompt ?? creativeDirection?.overallMusicPrompt ?? '',
    characterDescriptions: legacyV1?.characterDescriptions ?? creativeDirection?.characterDescriptions ?? {},
    colorPalette: legacyV1?.colorPalette ?? creativeDirection?.colorPalette ?? [],
    environmentNotes: legacyV1?.environmentNotes ?? creativeDirection?.environmentNotes ?? '',
    globalEditDirections: legacyV1?.globalEditDirections ?? creativeDirection?.globalEditDirections,
    suggestedProfileCategory: legacyV1?.suggestedProfileCategory ?? creativeDirection?.suggestedProfileCategory ?? '',
  };
}
