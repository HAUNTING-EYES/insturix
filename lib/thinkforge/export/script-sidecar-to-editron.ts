import type { SceneDescriptor } from '@/lib/pipeline/schemas/storyboard';
import {
  parseScriptSidecar,
  SCRIPT_SIDECAR_VERSION,
} from '@/lib/thinkforge/schemas/script-sidecar';

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