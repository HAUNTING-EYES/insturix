import { z } from 'zod';
import {
  SceneShotIntentModelObjectSchema,
  SceneShotIntentSchema,
} from '../production/scene-shot-intent';
import { CHARACTER_ROLES, LINE_DELIVERIES } from './script-sidecar';

export const SCRIPT_SIDECAR_V2_VERSION = 2 as const;
export const SCRIPT_RENDER_PLAN_VERSION = 1 as const;

const IdentifierSchema = z.string().min(1);
const NonEmptyTextSchema = z.string().min(1);
const SourceRefsSchema = z.array(IdentifierSchema).default([]);
const ModelSourceRefsSchema = z.array(z.string()).default([]);
const LanguageCodeSchema = z.string().regex(
  /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/,
  'languageCode must be a lowercase ISO 639 language with optional BCP 47 subtags',
);

function addContractIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

const NarrativeCharacterV2ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(CHARACTER_ROLES),
}).strict();

export const NarrativeCharacterV2Schema = NarrativeCharacterV2ModelSchema.extend({
  id: IdentifierSchema,
  name: NonEmptyTextSchema,
}).strict();

const NarrativeLineV2ModelObjectSchema = z.object({
  id: z.string(),
  // Structural reads preserve historic empty V1 lines; editorial quality is a later gate.
  text: z.string(),
  speakerId: z.string().optional(),
  languageCode: z.string().optional(),
  onCamera: z.boolean().default(false),
  delivery: z.enum(LINE_DELIVERIES),
  sourceRefs: ModelSourceRefsSchema,
}).strict();

const NarrativeLineV2ObjectSchema = NarrativeLineV2ModelObjectSchema.extend({
  id: IdentifierSchema,
  speakerId: IdentifierSchema.optional(),
  languageCode: LanguageCodeSchema.optional(),
  sourceRefs: SourceRefsSchema,
}).strict();

export const NarrativeLineV2Schema = NarrativeLineV2ObjectSchema.superRefine((line, ctx) => {
  if (line.delivery !== 'on-screen-text' && !line.speakerId) {
    addContractIssue(ctx, ['speakerId'], 'Spoken narrative lines must identify their speaker.');
  }
  if (line.delivery === 'sync-dialogue' && !line.onCamera) {
    addContractIssue(ctx, ['onCamera'], 'sync-dialogue lines must be on camera');
  }
});

const NarrativeVisualIntentV2ModelSchema = z.object({
  description: z.string(),
  motion: z.string().optional(),
  onScreenText: z.array(z.string()).default([]),
  imageQualityTokens: z.string().optional(),
  videoQualityTokens: z.string().optional(),
  assetRecommendation: z.enum(['ai-video', 'stock', 'animated-still', 'graphics-only']).optional(),
}).strict();

const NarrativeVisualIntentV2Schema = NarrativeVisualIntentV2ModelSchema.extend({
  description: NonEmptyTextSchema,
  motion: NonEmptyTextSchema.optional(),
  imageQualityTokens: NonEmptyTextSchema.optional(),
  videoQualityTokens: NonEmptyTextSchema.optional(),
}).strict();

const NarrativeAudioIntentV2ModelSchema = z.object({
  ambience: z.string().optional(),
  music: z.string().optional(),
  sfx: z.array(z.string()).default([]),
}).strict();

const NarrativeAudioIntentV2Schema = NarrativeAudioIntentV2ModelSchema.extend({
  ambience: NonEmptyTextSchema.optional(),
  music: NonEmptyTextSchema.optional(),
  sfx: z.array(NonEmptyTextSchema).default([]),
}).strict();

const NarrativeBeatV2ModelObjectSchema = z.object({
  id: z.string(),
  kind: z.enum(['dialogue', 'voiceover', 'visual', 'transition', 'mixed']),
  narrativePurpose: z.string(),
  durationIntentSeconds: z.number().optional(),
  lines: z.array(NarrativeLineV2ModelObjectSchema).default([]),
  visualIntent: NarrativeVisualIntentV2ModelSchema.optional(),
  audioIntent: NarrativeAudioIntentV2ModelSchema.optional(),
  shotIntent: SceneShotIntentModelObjectSchema.optional(),
  sourceRefs: ModelSourceRefsSchema,
}).strict();

const NarrativeBeatV2ObjectSchema = NarrativeBeatV2ModelObjectSchema.extend({
  id: IdentifierSchema,
  narrativePurpose: NonEmptyTextSchema,
  durationIntentSeconds: z.number().finite().positive().optional(),
  lines: z.array(NarrativeLineV2Schema).default([]),
  visualIntent: NarrativeVisualIntentV2Schema.optional(),
  audioIntent: NarrativeAudioIntentV2Schema.optional(),
  shotIntent: SceneShotIntentSchema.optional(),
  sourceRefs: SourceRefsSchema,
}).strict();

export const NarrativeBeatV2Schema = NarrativeBeatV2ObjectSchema.superRefine((beat, ctx) => {
  if (beat.lines.length === 0 && !beat.visualIntent) {
    addContractIssue(ctx, ['lines'], 'A narrative beat must contain lines or visual intent.');
  }
});

const NarrativeSceneV2ModelSchema = z.object({
  id: z.string(),
  title: z.string(),
  narrativePurpose: z.string(),
  durationIntentSeconds: z.number().optional(),
  mood: z.string().optional(),
  charactersPresent: z.array(z.string()).default([]),
  sourceRefs: ModelSourceRefsSchema,
  beats: z.array(NarrativeBeatV2ModelObjectSchema),
}).strict();

export const NarrativeSceneV2Schema = NarrativeSceneV2ModelSchema.extend({
  id: IdentifierSchema,
  title: NonEmptyTextSchema,
  narrativePurpose: NonEmptyTextSchema,
  durationIntentSeconds: z.number().finite().positive().optional(),
  mood: NonEmptyTextSchema.optional(),
  charactersPresent: z.array(IdentifierSchema).default([]),
  sourceRefs: SourceRefsSchema,
  beats: z.array(NarrativeBeatV2Schema).min(1),
}).strict();

const NarrativeActV2ModelSchema = z.object({
  id: z.string(),
  title: z.string(),
  narrativePurpose: z.string(),
  narrativeScenes: z.array(NarrativeSceneV2ModelSchema),
}).strict();

export const NarrativeActV2Schema = NarrativeActV2ModelSchema.extend({
  id: IdentifierSchema,
  title: NonEmptyTextSchema,
  narrativePurpose: NonEmptyTextSchema,
  narrativeScenes: z.array(NarrativeSceneV2Schema).min(1),
}).strict();

const RenderLineSpanV2Schema = z.object({
  lineId: IdentifierSchema,
  startOffsetUtf16: z.number().int().min(0),
  endOffsetUtf16: z.number().int().positive(),
}).strict().superRefine((span, ctx) => {
  if (span.endOffsetUtf16 <= span.startOffsetUtf16) {
    addContractIssue(ctx, ['endOffsetUtf16'], 'A render line span must have a non-empty offset range.');
  }
});

export const ProviderRenderSegmentV2Schema = z.object({
  id: IdentifierSchema,
  kind: z.enum(['lip-sync', 'voiceover', 'visual', 'graphic', 'composite']),
  narrativeSceneId: IdentifierSchema,
  beatId: IdentifierSchema,
  lineSpans: z.array(RenderLineSpanV2Schema).default([]),
  durationSeconds: z.number().finite().positive(),
  generationUnitId: IdentifierSchema.optional(),
}).strict();

const ScriptRenderPlanV2Schema = z.object({
  // Numeric literals become unsupported numeric enums in Gemini response schemas.
  // This remains a server-owned value and is checked after structural parsing.
  version: z.number().int().default(SCRIPT_RENDER_PLAN_VERSION),
  source: z.enum(['technical-planner', 'v1-adapter']),
  renderSegments: z.array(ProviderRenderSegmentV2Schema).default([]),
}).strict();

const CreativeDirectionV2Schema = z.object({
  overallMusicPrompt: z.string().optional(),
  characterDescriptions: z.record(z.string(), z.string()).optional(),
  colorPalette: z.array(z.string()).optional(),
  environmentNotes: z.string().optional(),
  globalEditDirections: z.record(z.string(), z.unknown()).optional(),
  suggestedProfileCategory: z.string().optional(),
}).strict();

function addDuplicateIdIssue(
  ctx: z.RefinementCtx,
  ids: Set<string>,
  id: string,
  path: Array<string | number>,
  family: string,
): void {
  if (ids.has(id)) {
    addContractIssue(ctx, path, `Duplicate ${family} id "${id}".`);
  }
  ids.add(id);
}

function validateSourceRefs(
  ctx: z.RefinementCtx,
  declaredRefs: Set<string>,
  refs: string[],
  path: Array<string | number>,
  owner: string,
): void {
  refs.forEach((sourceRef, sourceIndex) => {
    if (!declaredRefs.has(sourceRef)) {
      addContractIssue(
        ctx,
        [...path, 'sourceRefs', sourceIndex],
        `${owner} sourceRef "${sourceRef}" must be declared at sidecar level.`,
      );
    }
  });
}

const ScriptNarrativeSidecarV2ModelObjectSchema = z.object({
  // The version is defaulted for structured authoring, then enforced below.
  sidecarVersion: z.number().default(SCRIPT_SIDECAR_V2_VERSION),
  spokenTextSource: z.literal('beat-lines').default('beat-lines'),
  characters: z.array(NarrativeCharacterV2ModelSchema).default([]),
  acts: z.array(NarrativeActV2ModelSchema),
  creativeDirection: CreativeDirectionV2Schema.optional(),
  briefId: z.string().optional(),
  sourceRefs: ModelSourceRefsSchema,
}).strict();

const ScriptNarrativeSidecarV2ObjectSchema = ScriptNarrativeSidecarV2ModelObjectSchema.extend({
  sidecarVersion: z.number().int().default(SCRIPT_SIDECAR_V2_VERSION),
  characters: z.array(NarrativeCharacterV2Schema).default([]),
  acts: z.array(NarrativeActV2Schema).min(1),
  briefId: IdentifierSchema.optional(),
  sourceRefs: SourceRefsSchema,
}).strict();

const ScriptSidecarV2ObjectSchema = ScriptNarrativeSidecarV2ObjectSchema.extend({
  renderPlan: ScriptRenderPlanV2Schema.optional(),
}).strict();

type ScriptSidecarV2ValidationInput = z.infer<typeof ScriptSidecarV2ObjectSchema>;

function validateScriptSidecarV2(
  sidecar: ScriptSidecarV2ValidationInput,
  ctx: z.RefinementCtx,
): void {
  if (sidecar.sidecarVersion !== SCRIPT_SIDECAR_V2_VERSION) {
    addContractIssue(ctx, ['sidecarVersion'], `Expected Script Sidecar version ${SCRIPT_SIDECAR_V2_VERSION}.`);
  }
  if (sidecar.renderPlan && sidecar.renderPlan.version !== SCRIPT_RENDER_PLAN_VERSION) {
    addContractIssue(ctx, ['renderPlan', 'version'], `Expected render plan version ${SCRIPT_RENDER_PLAN_VERSION}.`);
  }

  const topLevelSourceRefs = new Set(sidecar.sourceRefs);
  const characterIds = new Set<string>();
  const actIds = new Set<string>();
  const sceneIds = new Set<string>();
  const beatIds = new Set<string>();
  const lineIds = new Set<string>();
  const renderSegmentIds = new Set<string>();
  const sceneIdsByReference = new Set<string>();
  const beatsById = new Map<string, { sceneId: string }>();
  const linesById = new Map<string, { beatId: string; text: string }>();

  sidecar.characters.forEach((character, characterIndex) => {
    addDuplicateIdIssue(ctx, characterIds, character.id, ['characters', characterIndex, 'id'], 'character');
  });

  sidecar.acts.forEach((act, actIndex) => {
    addDuplicateIdIssue(ctx, actIds, act.id, ['acts', actIndex, 'id'], 'act');
    act.narrativeScenes.forEach((scene, sceneIndex) => {
      const scenePath = ['acts', actIndex, 'narrativeScenes', sceneIndex] as Array<string | number>;
      addDuplicateIdIssue(ctx, sceneIds, scene.id, [...scenePath, 'id'], 'narrative scene');
      sceneIdsByReference.add(scene.id);

      scene.charactersPresent.forEach((characterId, characterIndex) => {
        if (!characterIds.has(characterId)) {
          addContractIssue(
            ctx,
            [...scenePath, 'charactersPresent', characterIndex],
            `charactersPresent id "${characterId}" must resolve to characters[].id`,
          );
        }
      });
      validateSourceRefs(ctx, topLevelSourceRefs, scene.sourceRefs, scenePath, 'Narrative scene');

      scene.beats.forEach((beat, beatIndex) => {
        const beatPath = [...scenePath, 'beats', beatIndex];
        addDuplicateIdIssue(ctx, beatIds, beat.id, [...beatPath, 'id'], 'beat');
        beatsById.set(beat.id, { sceneId: scene.id });
        validateSourceRefs(ctx, topLevelSourceRefs, beat.sourceRefs, beatPath, 'Beat');

        const syncSpeakerIds = new Set<string>();

        beat.lines.forEach((line, lineIndex) => {
          const linePath = [...beatPath, 'lines', lineIndex];
          addDuplicateIdIssue(ctx, lineIds, line.id, [...linePath, 'id'], 'line');
          linesById.set(line.id, { beatId: beat.id, text: line.text });
          if (line.speakerId && !characterIds.has(line.speakerId)) {
            addContractIssue(
              ctx,
              [...linePath, 'speakerId'],
              `speakerId "${line.speakerId}" must resolve to characters[].id`,
            );
          }
          if (line.onCamera && line.speakerId && !scene.charactersPresent.includes(line.speakerId)) {
            addContractIssue(
              ctx,
              [...linePath, 'speakerId'],
              `On-camera speaker "${line.speakerId}" must be present in the narrative scene.`,
            );
          }
          if (line.delivery === 'sync-dialogue' && line.speakerId) {
            syncSpeakerIds.add(line.speakerId);
          }
          validateSourceRefs(ctx, topLevelSourceRefs, line.sourceRefs, linePath, 'Line');
        });

        if (!beat.shotIntent && syncSpeakerIds.size > 0 && sidecar.renderPlan?.source !== 'v1-adapter') {
          addContractIssue(
            ctx,
            [...beatPath, 'shotIntent'],
            'A native V2 sync-dialogue beat must declare its shot and performance intent.',
          );
        }

        if (beat.shotIntent) {
          const performanceIds = new Set(
            beat.shotIntent.performance.map((performance) => performance.characterId),
          );
          beat.shotIntent.performance.forEach((performance, performanceIndex) => {
            const characterPath = [...beatPath, 'shotIntent', 'performance', performanceIndex, 'characterId'];
            if (!characterIds.has(performance.characterId)) {
              addContractIssue(
                ctx,
                characterPath,
                `Shot performer "${performance.characterId}" must resolve to characters[].id.`,
              );
            }
            if (!scene.charactersPresent.includes(performance.characterId)) {
              addContractIssue(
                ctx,
                characterPath,
                `Shot performer "${performance.characterId}" must be present in the narrative scene.`,
              );
            }
          });
          syncSpeakerIds.forEach((speakerId) => {
            if (!performanceIds.has(speakerId)) {
              addContractIssue(
                ctx,
                [...beatPath, 'shotIntent', 'performance'],
                `On-camera sync speaker "${speakerId}" must have performance intent.`,
              );
            }
          });
          if (beat.shotIntent.spokenAudio !== (syncSpeakerIds.size > 0)) {
            addContractIssue(
              ctx,
              [...beatPath, 'shotIntent', 'spokenAudio'],
              'shotIntent.spokenAudio must match the presence of on-camera sync dialogue.',
            );
          }
        }
      });
    });
  });

  sidecar.renderPlan?.renderSegments.forEach((segment, segmentIndex) => {
    const segmentPath = ['renderPlan', 'renderSegments', segmentIndex] as Array<string | number>;
    addDuplicateIdIssue(ctx, renderSegmentIds, segment.id, [...segmentPath, 'id'], 'render segment');
    const sceneExists = sceneIdsByReference.has(segment.narrativeSceneId);
    const beat = beatsById.get(segment.beatId);
    if (!sceneExists) {
      addContractIssue(
        ctx,
        [...segmentPath, 'narrativeSceneId'],
        `Render segment scene "${segment.narrativeSceneId}" does not exist.`,
      );
    }
    if (!beat) {
      addContractIssue(ctx, [...segmentPath, 'beatId'], `Render segment beat "${segment.beatId}" does not exist.`);
    } else if (beat.sceneId !== segment.narrativeSceneId) {
      addContractIssue(
        ctx,
        [...segmentPath, 'beatId'],
        `Render segment beat "${segment.beatId}" belongs to another narrative scene.`,
      );
    }

    segment.lineSpans.forEach((span, spanIndex) => {
      const spanPath = [...segmentPath, 'lineSpans', spanIndex];
      const line = linesById.get(span.lineId);
      if (!line) {
        addContractIssue(ctx, [...spanPath, 'lineId'], `Render segment line "${span.lineId}" does not exist.`);
        return;
      }
      if (line.beatId !== segment.beatId) {
        addContractIssue(
          ctx,
          [...spanPath, 'lineId'],
          `Render segment line "${span.lineId}" belongs to another beat.`,
        );
      }
      if (span.endOffsetUtf16 > line.text.length) {
        addContractIssue(
          ctx,
          [...spanPath, 'endOffsetUtf16'],
          `Render segment line span exceeds the canonical line text length (${line.text.length}).`,
        );
      }
    });
  });
}

export const ScriptSidecarV2Schema = ScriptSidecarV2ObjectSchema.superRefine(
  validateScriptSidecarV2,
);

/** Model-facing authoring contract: narrative intent only, with no technical render-plan field. */
export const ScriptWriterSidecarV2Schema = ScriptNarrativeSidecarV2ObjectSchema.superRefine(
  (sidecar, ctx) => validateScriptSidecarV2({ ...sidecar, renderPlan: undefined }, ctx),
);

/** Provider decoding contract: structural only so one bounded repair can handle semantic violations. */
export const ScriptWriterSidecarV2ModelSchema = ScriptNarrativeSidecarV2ModelObjectSchema;

export type NarrativeCharacterV2 = z.infer<typeof NarrativeCharacterV2Schema>;
export type NarrativeLineV2 = z.infer<typeof NarrativeLineV2Schema>;
export type NarrativeBeatV2 = z.infer<typeof NarrativeBeatV2Schema>;
export type NarrativeSceneV2 = z.infer<typeof NarrativeSceneV2Schema>;
export type NarrativeActV2 = z.infer<typeof NarrativeActV2Schema>;
export type ProviderRenderSegmentV2 = z.infer<typeof ProviderRenderSegmentV2Schema>;
export type ScriptSidecarV2 = z.infer<typeof ScriptSidecarV2Schema>;
export type ScriptWriterSidecarV2 = z.infer<typeof ScriptWriterSidecarV2Schema>;
export type ScriptWriterSidecarV2Model = z.infer<typeof ScriptWriterSidecarV2ModelSchema>;

export type ScriptWriterModelSidecarIdentityPolicy =
  | { mode: 'ordinary' }
  | { mode: 'chapter'; chapterId: string };

type ModelNarrativeBeat = ScriptWriterSidecarV2Model['acts'][number]['narrativeScenes'][number]['beats'][number];
type ModelContinuity = NonNullable<ModelNarrativeBeat['shotIntent']>['continuity'];

interface ModelNarrativeSceneIdentity {
  canonicalId: string;
}

interface ModelNarrativeBeatIdentity {
  originalBeatId: string;
  originalSceneId: string;
  canonicalId: string;
  index: number;
  isFinalBeatInScene: boolean;
}

export class ScriptWriterSidecarIdentityError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Script writer sidecar identity resolution failed: ${issues.join(', ')}`);
    this.name = 'ScriptWriterSidecarIdentityError';
  }
}

function addContinuityAlias(
  aliases: Map<string, ModelNarrativeBeatIdentity[]>,
  alias: string,
  identity: ModelNarrativeBeatIdentity,
): void {
  const entries = aliases.get(alias);
  if (!entries) {
    aliases.set(alias, [identity]);
    return;
  }
  if (!entries.includes(identity)) entries.push(identity);
}

function canonicalContinuityReferences(input: {
  continuity: ModelContinuity;
  currentBeat: ModelNarrativeBeatIdentity;
  beatIdentities: readonly ModelNarrativeBeatIdentity[];
  aliases: ReadonlyMap<string, readonly ModelNarrativeBeatIdentity[]>;
  issues: string[];
}): string[] {
  const { continuity, currentBeat, beatIdentities, aliases, issues } = input;
  const positionalReferences = continuity.previousBeatIndexes ?? [];
  const legacyReferences = continuity.previousSceneIds ?? [];
  const resolved: string[] = [];

  if (positionalReferences.length > 0 && legacyReferences.length > 0) {
    issues.push(`mixed_continuity_reference_forms:beat_${currentBeat.index + 1}`);
    return [];
  }

  for (const reference of positionalReferences) {
    const target = beatIdentities[reference - 1];
    if (!target) {
      issues.push(`unknown_continuity_beat_index:beat_${currentBeat.index + 1}:${reference}`);
    } else if (target.index >= currentBeat.index) {
      issues.push(`forward_continuity_beat_index:beat_${currentBeat.index + 1}:${reference}`);
    } else {
      resolved.push(target.canonicalId);
    }
  }

  for (const reference of legacyReferences) {
    const candidates = aliases.get(reference) ?? [];
    const preceding = candidates.filter((candidate) => candidate.index < currentBeat.index);
    if (candidates.length === 0) {
      issues.push(`unknown_legacy_continuity_alias:beat_${currentBeat.index + 1}:${reference}`);
    } else if (preceding.length === 0) {
      issues.push(`forward_legacy_continuity_alias:beat_${currentBeat.index + 1}:${reference}`);
    } else if (preceding.length > 1) {
      issues.push(`ambiguous_legacy_continuity_alias:beat_${currentBeat.index + 1}:${reference}`);
    } else {
      resolved.push(preceding[0]!.canonicalId);
    }
  }

  return [...new Set(resolved)];
}

/**
 * The model owns narrative content, never persisted technical identifiers. Ordinary
 * scripts receive a complete server-issued hierarchy. Chapter jobs preserve their
 * approved act/scene identities while still issuing beat and line IDs server-side.
 */
export function canonicalizeScriptWriterModelSidecarIds(
  sidecar: ScriptWriterSidecarV2Model,
  policy: ScriptWriterModelSidecarIdentityPolicy,
): unknown {
  const scenes = sidecar.acts.flatMap((act) => act.narrativeScenes);
  const sceneIdentities = scenes.map((scene, index) => ({
    canonicalId: policy.mode === 'ordinary' ? `scene_${index + 1}` : scene.id,
  }));
  const beatIdentities: ModelNarrativeBeatIdentity[] = [];
  let sourceSceneIndex = 0;
  let sourceBeatIndex = 0;
  sidecar.acts.forEach((act) => act.narrativeScenes.forEach((scene) => {
    const sceneIdentity = sceneIdentities[sourceSceneIndex++]!;
    scene.beats.forEach((beat, sceneBeatIndex) => {
      beatIdentities.push({
        originalBeatId: beat.id,
        originalSceneId: scene.id,
        canonicalId: policy.mode === 'ordinary'
          ? `beat_${sourceBeatIndex + 1}`
          : `beat_${policy.chapterId}_${sceneIdentity.canonicalId}_${sceneBeatIndex + 1}`,
        index: sourceBeatIndex,
        isFinalBeatInScene: sceneBeatIndex === scene.beats.length - 1,
      });
      sourceBeatIndex += 1;
    });
  }));
  const aliases = new Map<string, ModelNarrativeBeatIdentity[]>();
  beatIdentities.forEach((identity) => {
    addContinuityAlias(aliases, identity.originalBeatId, identity);
    if (identity.isFinalBeatInScene) {
      addContinuityAlias(aliases, identity.originalSceneId, identity);
    }
  });
  const issues: string[] = [];
  let sceneIndex = 0;
  let beatIndex = 0;
  let lineIndex = 0;

  const normalized = {
    ...sidecar,
    acts: sidecar.acts.map((act, actIndex) => ({
      ...act,
      id: policy.mode === 'ordinary' ? `act_${actIndex + 1}` : act.id,
      narrativeScenes: act.narrativeScenes.map((scene) => {
        const currentSceneIndex = sceneIndex++;
        const sceneIdentity = sceneIdentities[currentSceneIndex]!;
        return {
          ...scene,
          id: sceneIdentity.canonicalId,
          beats: scene.beats.map((beat, sceneBeatIndex) => {
            const beatIdentity = beatIdentities[beatIndex++]!;
            const nextLines = beat.lines.map((line, lineIndexWithinBeat) => {
              const currentLineIndex = lineIndex++;
              return {
                ...line,
                id: policy.mode === 'ordinary'
                  ? `line_${currentLineIndex + 1}`
                  : `line_${policy.chapterId}_${sceneIdentity.canonicalId}_${sceneBeatIndex + 1}_${lineIndexWithinBeat + 1}`,
              };
            });
            if (!beat.shotIntent) {
              return { ...beat, id: beatIdentity.canonicalId, lines: nextLines };
            }
            const {
              previousBeatIndexes: _previousBeatIndexes,
              previousSceneIds: _previousSceneIds,
              ...continuity
            } = beat.shotIntent.continuity;
            return {
              ...beat,
              id: beatIdentity.canonicalId,
              lines: nextLines,
              shotIntent: {
                ...beat.shotIntent,
                continuity: {
                  ...continuity,
                  previousSceneIds: canonicalContinuityReferences({
                    continuity: beat.shotIntent.continuity,
                    currentBeat: beatIdentity,
                    beatIdentities,
                    aliases,
                    issues,
                  }),
                },
              },
            };
          }),
        };
      }),
    })),
  };

  if (issues.length > 0) throw new ScriptWriterSidecarIdentityError(issues);
  return normalized;
}

/** Audible text has exactly one owner: ordered beat lines, never render segments. */
export function getCanonicalBeatSpokenText(
  beat: Pick<NarrativeBeatV2, 'lines'>,
): string {
  return beat.lines
    .filter((line) => line.delivery !== 'on-screen-text')
    .map((line) => line.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseScriptSidecarV2(input: unknown): ScriptSidecarV2 {
  return ScriptSidecarV2Schema.parse(input);
}
