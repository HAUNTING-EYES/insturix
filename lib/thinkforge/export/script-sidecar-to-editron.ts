import type { SceneDescriptor } from '@/lib/pipeline/schemas/storyboard';
import {
  parseScriptSidecar,
  SCRIPT_SIDECAR_VERSION,
} from '@/lib/thinkforge/schemas/script-sidecar';
import {
  projectThinkForgeAuthoringProvenance,
  type ThinkForgeAuthoringProvenance,
} from '@/lib/thinkforge/context/brand-authoring-context';

export const THINKFORGE_EDITRON_HANDOFF_VERSION = 1 as const;

export interface ThinkForgeEditronHandoffContext {
  version: typeof THINKFORGE_EDITRON_HANDOFF_VERSION;
  authoringProvenance?: ThinkForgeAuthoringProvenance;
  briefSnapshot?: Record<string, unknown>;
  sourceLedger?: Record<string, unknown>;
  sidecarSourceRefs: string[];
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
  scenes: SceneDescriptor[];
  overallMusicPrompt: string;
  characterDescriptions: Record<string, string>;
  colorPalette: string[];
  environmentNotes: string;
  globalEditDirections: Record<string, unknown> | undefined;
  suggestedProfileCategory: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/** Preserve server-resolved ThinkForge context for the downstream Editron seam. */
export function buildThinkForgeEditronHandoffContext(input: {
  sidecar?: unknown;
  briefSnapshot?: unknown;
  sourceLedger?: unknown;
  authoringContextSnapshot?: unknown;
  expectedBrandId?: string;
}): ThinkForgeEditronHandoffContext {
  const sidecar = input.sidecar ? parseScriptSidecar(input.sidecar) : null;
  const briefSnapshot = sanitizeBriefSnapshotForEditron(input.briefSnapshot);
  const sourceLedger = asRecord(input.sourceLedger);
  const authoringProvenance = projectThinkForgeAuthoringProvenance({
    snapshot: input.authoringContextSnapshot,
    expectedBrandId: input.expectedBrandId,
  });
  const castingMap = asRecord(asRecord(briefSnapshot?.casting)?.map);
  const avatarDirectives = sidecar
    ? sidecar.scenes
      .map((scene, sceneIndex) => {
        const speakers = scene.lines
          .filter((line) => line.onCamera && line.delivery === 'sync-dialogue')
          .map((line) => {
            const casting = asRecord(castingMap?.[line.speakerId]);
            const voice = asRecord(casting?.voice);
            return {
              characterId: line.speakerId,
              ...(typeof casting?.avatarProfileId === 'string' ? { avatarProfileId: casting.avatarProfileId } : {}),
              voiceMode: resolveVoiceMode(voice),
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
      .filter((directive): directive is ThinkForgeAvatarSceneDirective => directive !== null)
    : [];

  return {
    version: THINKFORGE_EDITRON_HANDOFF_VERSION,
    ...(authoringProvenance ? { authoringProvenance } : {}),
    ...(briefSnapshot ? { briefSnapshot } : {}),
    ...(sourceLedger ? { sourceLedger } : {}),
    sidecarSourceRefs: sidecar ? [...sidecar.sourceRefs] : [],
    avatarDirectives,
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
    const sanitizedVoice = voice
      ? { mode: resolveVoiceMode(voice) }
      : undefined;
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

/**
 * Converts a validated writer sidecar into Editron's established scene contract.
 * The writer created these scenes in its original structured response, so this
 * deliberately maps fields without asking a second model to reinterpret prose.
 */
export function mapScriptSidecarToEditronExport(input: unknown): ScriptSidecarEditronExport {
  const sidecar = parseScriptSidecar(input);
  if (sidecar.sidecarVersion !== SCRIPT_SIDECAR_VERSION) {
    throw new Error(`Unsupported script sidecar version: ${sidecar.sidecarVersion}`);
  }

  return {
    sidecarVersion: sidecar.sidecarVersion,
    scenes: sidecar.scenes.map((scene, sceneIndex) => ({
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
    })),
    overallMusicPrompt: sidecar.overallMusicPrompt,
    characterDescriptions: sidecar.characterDescriptions,
    colorPalette: sidecar.colorPalette,
    environmentNotes: sidecar.environmentNotes,
    globalEditDirections: sidecar.globalEditDirections,
    suggestedProfileCategory: sidecar.suggestedProfileCategory,
  };
}
