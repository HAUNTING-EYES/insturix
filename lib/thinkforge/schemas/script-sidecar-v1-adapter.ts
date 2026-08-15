import {
  parseScriptSidecar,
  SCRIPT_SIDECAR_VERSION,
  type ScriptSidecar,
  type SidecarLine,
} from './script-sidecar';
import {
  parseScriptSidecarV2,
  SCRIPT_RENDER_PLAN_VERSION,
  SCRIPT_SIDECAR_V2_VERSION,
  type NarrativeBeatV2,
  type ProviderRenderSegmentV2,
  type ScriptSidecarV2,
} from './script-sidecar-v2';

export type ScriptSidecarReadResult =
  | {
      sourceVersion: typeof SCRIPT_SIDECAR_VERSION;
      sidecar: ScriptSidecarV2;
      legacyV1: ScriptSidecar;
    }
  | {
      sourceVersion: typeof SCRIPT_SIDECAR_V2_VERSION;
      sidecar: ScriptSidecarV2;
    };

type LegacyScriptSidecarReadResult = Extract<ScriptSidecarReadResult, { sourceVersion: 1 }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readDeclaredVersion(input: unknown): number | undefined {
  if (!isRecord(input) || input.sidecarVersion === undefined) return undefined;
  if (typeof input.sidecarVersion !== 'number' || !Number.isInteger(input.sidecarVersion)) {
    throw new Error('Invalid script sidecar version: expected an integer.');
  }
  return input.sidecarVersion;
}

function narrativeBeatKind(lines: SidecarLine[]): NarrativeBeatV2['kind'] {
  const deliveries = new Set(lines.map((line) => line.delivery));
  if (deliveries.size > 1) return 'mixed';
  if (deliveries.has('sync-dialogue')) return 'dialogue';
  if (deliveries.has('voiceover')) return 'voiceover';
  return 'visual';
}

function renderSegmentKind(lines: SidecarLine[]): ProviderRenderSegmentV2['kind'] {
  const deliveries = new Set(lines.map((line) => line.delivery));
  if (deliveries.size > 1) return 'composite';
  if (deliveries.has('sync-dialogue')) return 'lip-sync';
  if (deliveries.has('voiceover')) return 'voiceover';
  if (deliveries.has('on-screen-text')) return 'graphic';
  return 'visual';
}

function positiveDuration(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Reads V1 through its canonical parser, then projects narrative structure without inventing
 * acts, sub-beats, or provider-driven scene splits. The normalized V1 object is retained in
 * full on the result so every legacy render field and passthrough property remains available.
 */
export function adaptScriptSidecarV1(input: unknown): LegacyScriptSidecarReadResult {
  const declaredVersion = readDeclaredVersion(input);
  if (declaredVersion !== undefined && declaredVersion !== SCRIPT_SIDECAR_VERSION) {
    throw new Error(`Cannot adapt Script Sidecar version ${declaredVersion} as V1.`);
  }

  const legacyV1 = parseScriptSidecar(input);
  const charactersById = new Map<string, ScriptSidecar['characters'][number]>();
  legacyV1.characters.forEach((character) => {
    if (!charactersById.has(character.id)) charactersById.set(character.id, character);
  });
  const renderSegments: ProviderRenderSegmentV2[] = [];
  const narrativeScenes = legacyV1.scenes.map((scene, sceneIndex) => {
    const sceneId = `scene_${sceneIndex + 1}`;
    const beatId = `beat_${sceneIndex + 1}_1`;
    const lines = scene.lines.map((line, lineIndex) => ({
      id: `line_${sceneIndex + 1}_${lineIndex + 1}`,
      text: line.text,
      speakerId: line.speakerId,
      onCamera: line.onCamera,
      delivery: line.delivery,
      sourceRefs: [...(line.sourceRefs ?? [])],
    }));
    const durationIntentSeconds = positiveDuration(scene.durationSeconds);
    const spokenLineSpans = lines
      .filter((line) => line.delivery !== 'on-screen-text')
      .map((line) => ({
        lineId: line.id,
        startOffsetUtf16: 0,
        endOffsetUtf16: line.text.length,
      }))
      .filter((span) => span.endOffsetUtf16 > 0);

    if (durationIntentSeconds) {
      renderSegments.push({
        id: `render_segment_${sceneIndex + 1}_1`,
        kind: renderSegmentKind(scene.lines),
        narrativeSceneId: sceneId,
        beatId,
        lineSpans: spokenLineSpans,
        durationSeconds: durationIntentSeconds,
        generationUnitId: scene.generationUnitId,
      });
    }

    return {
      id: sceneId,
      title: scene.title,
      narrativePurpose: scene.shotIntent?.narrativePurpose || scene.title,
      ...(durationIntentSeconds ? { durationIntentSeconds } : {}),
      mood: scene.mood,
      charactersPresent: [...scene.charactersPresent],
      sourceRefs: [...scene.sourceRefs],
      beats: [{
        id: beatId,
        kind: narrativeBeatKind(scene.lines),
        narrativePurpose: scene.shotIntent?.emotionalBeat || scene.title,
        ...(durationIntentSeconds ? { durationIntentSeconds } : {}),
        lines,
        visualIntent: {
          description: scene.visualDescription,
          ...(scene.videoMotionPrompt.trim() ? { motion: scene.videoMotionPrompt } : {}),
          onScreenText: scene.editDirections?.onScreenText ?? [],
        },
        sourceRefs: [...scene.sourceRefs],
      }],
    };
  });

  const sidecar = parseScriptSidecarV2({
    sidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
    spokenTextSource: 'beat-lines',
    characters: Array.from(charactersById.values(), (character) => ({ ...character })),
    acts: [{
      id: 'act_1',
      title: 'Legacy V1 narrative',
      narrativePurpose: 'Preserve the original V1 scene order without inferring act boundaries.',
      narrativeScenes,
    }],
    renderPlan: {
      version: SCRIPT_RENDER_PLAN_VERSION,
      source: 'v1-adapter',
      renderSegments,
    },
    creativeDirection: {
      overallMusicPrompt: legacyV1.overallMusicPrompt,
      characterDescriptions: { ...legacyV1.characterDescriptions },
      colorPalette: [...legacyV1.colorPalette],
      environmentNotes: legacyV1.environmentNotes,
      ...(legacyV1.globalEditDirections
        ? { globalEditDirections: { ...legacyV1.globalEditDirections } }
        : {}),
      suggestedProfileCategory: legacyV1.suggestedProfileCategory,
    },
    ...(legacyV1.briefId ? { briefId: legacyV1.briefId } : {}),
    sourceRefs: [...legacyV1.sourceRefs],
  });

  return { sourceVersion: SCRIPT_SIDECAR_VERSION, sidecar, legacyV1 };
}

/** Version-discriminating reader for migration callers; no live consumer uses it yet. */
export function readScriptSidecar(input: unknown): ScriptSidecarReadResult {
  const declaredVersion = readDeclaredVersion(input);
  if (declaredVersion === undefined || declaredVersion === SCRIPT_SIDECAR_VERSION) {
    return adaptScriptSidecarV1(input);
  }
  if (declaredVersion === SCRIPT_SIDECAR_V2_VERSION) {
    return {
      sourceVersion: SCRIPT_SIDECAR_V2_VERSION,
      sidecar: parseScriptSidecarV2(input),
    };
  }
  throw new Error(`Unsupported script sidecar version: ${declaredVersion}.`);
}
