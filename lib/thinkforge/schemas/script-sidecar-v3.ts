import { z } from 'zod';
import { CHARACTER_ROLES, LINE_DELIVERIES } from './script-sidecar';
import type { ScriptWriterModelSidecarIdentityPolicy } from './script-sidecar-v2';
import {
  VideoTreatmentSidecarBindingSchema,
  VisualEventSchema,
  type VideoTreatment,
} from './video-treatment';

export const SCRIPT_SIDECAR_V3_VERSION = 3 as const;

const IdentifierSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);
const NonEmptyTextSchema = z.string().min(1);
const SourceRefsSchema = z.array(IdentifierSchema).default([]);
const ModelSourceRefsSchema = z.array(z.string()).default([]);
const LanguageCodeSchema = z.string().regex(
  /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/,
  'languageCode must be a lowercase ISO 639 language with optional BCP 47 subtags',
);

function addIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

function addDuplicateIdIssue(
  ctx: z.RefinementCtx,
  ids: Set<string>,
  id: string,
  path: Array<string | number>,
  family: string,
): void {
  if (ids.has(id)) addIssue(ctx, path, `Duplicate ${family} id "${id}".`);
  ids.add(id);
}

function validateSourceRefs(
  ctx: z.RefinementCtx,
  declaredRefs: Set<string>,
  refs: readonly string[],
  path: Array<string | number>,
  owner: string,
): void {
  refs.forEach((sourceRef, sourceIndex) => {
    if (!declaredRefs.has(sourceRef)) {
      addIssue(
        ctx,
        [...path, 'sourceRefs', sourceIndex],
        `${owner} sourceRef "${sourceRef}" must be declared at sidecar level.`,
      );
    }
  });
}

const NarrativeCharacterV3ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(CHARACTER_ROLES),
}).strict();

export const NarrativeCharacterV3Schema = NarrativeCharacterV3ModelSchema.extend({
  id: IdentifierSchema,
  name: NonEmptyTextSchema,
}).strict();

const NarrativeLineV3ModelObjectSchema = z.object({
  id: z.string(),
  text: z.string(),
  speakerId: z.string().optional(),
  languageCode: z.string().optional(),
  onCamera: z.boolean().default(false),
  delivery: z.enum(LINE_DELIVERIES),
  sourceRefs: ModelSourceRefsSchema,
}).strict();

const NarrativeLineV3ObjectSchema = NarrativeLineV3ModelObjectSchema.extend({
  id: IdentifierSchema,
  speakerId: IdentifierSchema.optional(),
  languageCode: LanguageCodeSchema.optional(),
  sourceRefs: SourceRefsSchema,
}).strict();

export const NarrativeLineV3Schema = NarrativeLineV3ObjectSchema.superRefine((line, ctx) => {
  if (line.delivery !== 'on-screen-text' && !line.speakerId) {
    addIssue(ctx, ['speakerId'], 'Spoken narrative lines must identify their speaker.');
  }
  if (line.delivery === 'sync-dialogue' && !line.onCamera) {
    addIssue(ctx, ['onCamera'], 'sync-dialogue lines must be on camera.');
  }
});

const TreatmentVisualEventSelectionModelSchema = z.object({
  treatmentEventId: z.string(),
}).strict();

export const NarrativeVisualEventV3Schema = VisualEventSchema.extend({
  treatmentEventId: IdentifierSchema,
}).strict().superRefine((event, ctx) => {
  if (event.id !== event.treatmentEventId) {
    addIssue(ctx, ['treatmentEventId'], 'A V3 visual event must retain its treatment event identity.');
  }
});

const NarrativeBeatV3ModelObjectSchema = z.object({
  id: z.string(),
  kind: z.enum(['dialogue', 'voiceover', 'visual', 'transition', 'mixed']),
  narrativePurpose: z.string(),
  durationIntentSeconds: z.number().optional(),
  lines: z.array(NarrativeLineV3ModelObjectSchema).default([]),
  treatmentVisualEvents: z.array(TreatmentVisualEventSelectionModelSchema).default([]),
  sourceRefs: ModelSourceRefsSchema,
}).strict();

const NarrativeBeatV3ObjectSchema = z.object({
  id: IdentifierSchema,
  kind: z.enum(['dialogue', 'voiceover', 'visual', 'transition', 'mixed']),
  narrativePurpose: NonEmptyTextSchema,
  durationIntentSeconds: z.number().finite().positive().optional(),
  lines: z.array(NarrativeLineV3Schema).default([]),
  visualEvents: z.array(NarrativeVisualEventV3Schema).default([]),
  sourceRefs: SourceRefsSchema,
  // These V2 render-form fields are named only to keep legacy consumers type-safe.
  // `z.never()` makes their presence a hard V3 contract failure.
  visualIntent: z.never().optional(),
  audioIntent: z.never().optional(),
  shotIntent: z.never().optional(),
}).strict();

export const NarrativeBeatV3Schema = NarrativeBeatV3ObjectSchema.superRefine((beat, ctx) => {
  if (beat.lines.length === 0 && beat.visualEvents.length === 0) {
    addIssue(ctx, ['lines'], 'A narrative beat must contain lines or semantic visual events.');
  }
  const eventIds = new Set<string>();
  beat.visualEvents.forEach((event, index) => {
    if (eventIds.has(event.treatmentEventId)) {
      addIssue(ctx, ['visualEvents', index, 'treatmentEventId'], 'A treatment visual event may appear only once in one beat.');
    }
    eventIds.add(event.treatmentEventId);
  });
});

const NarrativeSceneV3ModelSchema = z.object({
  id: z.string(),
  title: z.string(),
  narrativePurpose: z.string(),
  durationIntentSeconds: z.number().optional(),
  mood: z.string().optional(),
  charactersPresent: z.array(z.string()).default([]),
  sourceRefs: ModelSourceRefsSchema,
  beats: z.array(NarrativeBeatV3ModelObjectSchema),
}).strict();

export const NarrativeSceneV3Schema = NarrativeSceneV3ModelSchema.extend({
  id: IdentifierSchema,
  title: NonEmptyTextSchema,
  narrativePurpose: NonEmptyTextSchema,
  durationIntentSeconds: z.number().finite().positive().optional(),
  mood: NonEmptyTextSchema.optional(),
  charactersPresent: z.array(IdentifierSchema).default([]),
  sourceRefs: SourceRefsSchema,
  beats: z.array(NarrativeBeatV3Schema).min(1),
}).strict();

const NarrativeActV3ModelSchema = z.object({
  id: z.string(),
  title: z.string(),
  narrativePurpose: z.string(),
  narrativeScenes: z.array(NarrativeSceneV3ModelSchema),
}).strict();

export const NarrativeActV3Schema = NarrativeActV3ModelSchema.extend({
  id: IdentifierSchema,
  title: NonEmptyTextSchema,
  narrativePurpose: NonEmptyTextSchema,
  narrativeScenes: z.array(NarrativeSceneV3Schema).min(1),
}).strict();

const ScriptWriterSidecarV3ModelObjectSchema = z.object({
  // Numeric literals become Gemini numeric enums. The server checks the version after decoding.
  sidecarVersion: z.number().int().default(SCRIPT_SIDECAR_V3_VERSION),
  spokenTextSource: z.literal('beat-lines').default('beat-lines'),
  characters: z.array(NarrativeCharacterV3ModelSchema).default([]),
  acts: z.array(NarrativeActV3ModelSchema),
  briefId: z.string().optional(),
  sourceRefs: ModelSourceRefsSchema,
}).strict();

const ScriptSidecarV3ObjectSchema = z.object({
  sidecarVersion: z.number().int().default(SCRIPT_SIDECAR_V3_VERSION),
  spokenTextSource: z.literal('beat-lines').default('beat-lines'),
  treatment: VideoTreatmentSidecarBindingSchema,
  characters: z.array(NarrativeCharacterV3Schema).default([]),
  acts: z.array(NarrativeActV3Schema).min(1),
  briefId: IdentifierSchema.optional(),
  sourceRefs: SourceRefsSchema,
  // V3 keeps treatment semantics separate from V2 creative/render form.
  creativeDirection: z.never().optional(),
  renderPlan: z.never().optional(),
}).strict();

function validateScriptSidecarV3(
  sidecar: z.infer<typeof ScriptSidecarV3ObjectSchema>,
  ctx: z.RefinementCtx,
): void {
  if (sidecar.sidecarVersion !== SCRIPT_SIDECAR_V3_VERSION) {
    addIssue(ctx, ['sidecarVersion'], `Expected Script Sidecar version ${SCRIPT_SIDECAR_V3_VERSION}.`);
  }

  const declaredRefs = new Set(sidecar.sourceRefs);
  const characterIds = new Set<string>();
  const actIds = new Set<string>();
  const sceneIds = new Set<string>();
  const beatIds = new Set<string>();
  const lineIds = new Set<string>();

  sidecar.characters.forEach((character, characterIndex) => {
    addDuplicateIdIssue(ctx, characterIds, character.id, ['characters', characterIndex, 'id'], 'character');
  });

  sidecar.acts.forEach((act, actIndex) => {
    addDuplicateIdIssue(ctx, actIds, act.id, ['acts', actIndex, 'id'], 'act');
    act.narrativeScenes.forEach((scene, sceneIndex) => {
      const scenePath = ['acts', actIndex, 'narrativeScenes', sceneIndex] as Array<string | number>;
      addDuplicateIdIssue(ctx, sceneIds, scene.id, [...scenePath, 'id'], 'narrative scene');
      validateSourceRefs(ctx, declaredRefs, scene.sourceRefs, scenePath, 'Narrative scene');

      scene.charactersPresent.forEach((characterId, characterIndex) => {
        if (!characterIds.has(characterId)) {
          addIssue(
            ctx,
            [...scenePath, 'charactersPresent', characterIndex],
            `charactersPresent id "${characterId}" must resolve to characters[].id.`,
          );
        }
      });

      scene.beats.forEach((beat, beatIndex) => {
        const beatPath = [...scenePath, 'beats', beatIndex];
        addDuplicateIdIssue(ctx, beatIds, beat.id, [...beatPath, 'id'], 'beat');
        validateSourceRefs(ctx, declaredRefs, beat.sourceRefs, beatPath, 'Beat');

        beat.lines.forEach((line, lineIndex) => {
          const linePath = [...beatPath, 'lines', lineIndex];
          addDuplicateIdIssue(ctx, lineIds, line.id, [...linePath, 'id'], 'line');
          validateSourceRefs(ctx, declaredRefs, line.sourceRefs, linePath, 'Line');
          if (line.speakerId && !characterIds.has(line.speakerId)) {
            addIssue(ctx, [...linePath, 'speakerId'], `speakerId "${line.speakerId}" must resolve to characters[].id.`);
          }
          if (line.onCamera && line.speakerId && !scene.charactersPresent.includes(line.speakerId)) {
            addIssue(
              ctx,
              [...linePath, 'speakerId'],
              `On-camera speaker "${line.speakerId}" must be present in the narrative scene.`,
            );
          }
        });

        beat.visualEvents.forEach((event, eventIndex) => {
          validateSourceRefs(
            ctx,
            declaredRefs,
            event.sourceRefs,
            [...beatPath, 'visualEvents', eventIndex],
            'Semantic visual event',
          );
        });
      });
    });
  });
}

export const ScriptSidecarV3Schema = ScriptSidecarV3ObjectSchema.superRefine(validateScriptSidecarV3);

/** Provider decoding contract: the model chooses treatment event references only. */
export const ScriptWriterSidecarV3ModelSchema = ScriptWriterSidecarV3ModelObjectSchema;

export type NarrativeCharacterV3 = z.infer<typeof NarrativeCharacterV3Schema>;
export type NarrativeLineV3 = z.infer<typeof NarrativeLineV3Schema>;
export type NarrativeVisualEventV3 = z.infer<typeof NarrativeVisualEventV3Schema>;
export type NarrativeBeatV3 = z.infer<typeof NarrativeBeatV3Schema>;
export type NarrativeSceneV3 = z.infer<typeof NarrativeSceneV3Schema>;
export type NarrativeActV3 = z.infer<typeof NarrativeActV3Schema>;
export type ScriptSidecarV3 = z.infer<typeof ScriptSidecarV3Schema>;
export type ScriptWriterSidecarV3Model = z.infer<typeof ScriptWriterSidecarV3ModelSchema>;

export class ScriptSidecarV3IdentityError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Script writer V3 sidecar identity resolution failed: ${issues.join(', ')}`);
    this.name = 'ScriptSidecarV3IdentityError';
  }
}

export class ScriptSidecarV3TreatmentError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Script writer V3 treatment resolution failed: ${issues.join(', ')}`);
    this.name = 'ScriptSidecarV3TreatmentError';
  }
}

/** The model never owns persisted hierarchy IDs. Chapter jobs retain only approved act/scene IDs. */
export function canonicalizeScriptWriterV3ModelSidecarIds(
  sidecar: ScriptWriterSidecarV3Model,
  policy: ScriptWriterModelSidecarIdentityPolicy,
): ScriptWriterSidecarV3Model {
  if (sidecar.sidecarVersion !== SCRIPT_SIDECAR_V3_VERSION) {
    throw new ScriptSidecarV3IdentityError([`unexpected_sidecar_version:${sidecar.sidecarVersion}`]);
  }

  let sceneIndex = 0;
  let beatIndex = 0;
  let lineIndex = 0;
  return {
    ...sidecar,
    acts: sidecar.acts.map((act, actIndex) => ({
      ...act,
      id: policy.mode === 'ordinary' ? `act_${actIndex + 1}` : act.id,
      narrativeScenes: act.narrativeScenes.map((scene) => {
        const canonicalSceneId = policy.mode === 'ordinary' ? `scene_${sceneIndex + 1}` : scene.id;
        sceneIndex += 1;
        return {
          ...scene,
          id: canonicalSceneId,
          beats: scene.beats.map((beat, beatIndexWithinScene) => {
            const canonicalBeatId = policy.mode === 'ordinary'
              ? `beat_${beatIndex + 1}`
              : `beat_${policy.chapterId}_${canonicalSceneId}_${beatIndexWithinScene + 1}`;
            beatIndex += 1;
            return {
              ...beat,
              id: canonicalBeatId,
              lines: beat.lines.map((line, lineIndexWithinBeat) => {
                const canonicalLineId = policy.mode === 'ordinary'
                  ? `line_${lineIndex + 1}`
                  : `line_${policy.chapterId}_${canonicalSceneId}_${beatIndexWithinScene + 1}_${lineIndexWithinBeat + 1}`;
                lineIndex += 1;
                return { ...line, id: canonicalLineId };
              }),
            };
          }),
        };
      }),
    })),
  };
}

/**
 * Materializes a V3 sidecar from model-selected treatment IDs. The model cannot
 * mutate treatment semantics or provenance; those are copied from the approved treatment.
 */
export function materializeScriptSidecarV3(input: {
  modelSidecar: ScriptWriterSidecarV3Model;
  treatment: VideoTreatment;
  identityPolicy: ScriptWriterModelSidecarIdentityPolicy;
  /** A chapter can materialize only the treatment events allocated to its scenes. */
  treatmentEventIds?: readonly string[];
}): ScriptSidecarV3 {
  const canonical = canonicalizeScriptWriterV3ModelSidecarIds(
    input.modelSidecar,
    input.identityPolicy,
  );
  const treatmentEvents = new Map(input.treatment.visualEvents.map((event) => [event.id, event]));
  const selectedEventIds = new Set<string>();
  const issues: string[] = [];
  const expectedEventIds = new Set<string>();
  const scopedEventIds = input.treatmentEventIds ?? input.treatment.visualEvents.map((event) => event.id);
  scopedEventIds.forEach((eventId) => {
    if (expectedEventIds.has(eventId)) {
      issues.push(`duplicate_treatment_event_scope:${eventId}`);
      return;
    }
    if (!treatmentEvents.has(eventId)) {
      issues.push(`unknown_treatment_event_scope:${eventId}`);
      return;
    }
    expectedEventIds.add(eventId);
  });

  const acts = canonical.acts.map((act) => ({
    ...act,
    narrativeScenes: act.narrativeScenes.map((scene) => {
      const beats = scene.beats.map((beat) => {
        const visualEvents = beat.treatmentVisualEvents.map((selection) => {
          const treatmentEvent = treatmentEvents.get(selection.treatmentEventId);
          if (!treatmentEvent) {
            issues.push(`unknown_treatment_visual_event:${selection.treatmentEventId}`);
            return null;
          }
          if (!expectedEventIds.has(treatmentEvent.id)) {
            issues.push(`out_of_scope_treatment_visual_event:${treatmentEvent.id}`);
            return null;
          }
          if (selectedEventIds.has(treatmentEvent.id)) {
            issues.push(`duplicate_treatment_visual_event:${treatmentEvent.id}`);
            return null;
          }
          selectedEventIds.add(treatmentEvent.id);
          return {
            ...structuredClone(treatmentEvent),
            treatmentEventId: treatmentEvent.id,
          };
        }).filter((event): event is NonNullable<typeof event> => event !== null);
        const sourceRefs = unique([
          ...beat.sourceRefs,
          ...beat.lines.flatMap((line) => line.sourceRefs),
          ...visualEvents.flatMap((event) => event.sourceRefs),
        ]);
        return {
          id: beat.id,
          kind: beat.kind,
          narrativePurpose: beat.narrativePurpose,
          ...(beat.durationIntentSeconds === undefined ? {} : { durationIntentSeconds: beat.durationIntentSeconds }),
          lines: beat.lines,
          visualEvents,
          sourceRefs,
        };
      });
      return {
        id: scene.id,
        title: scene.title,
        narrativePurpose: scene.narrativePurpose,
        ...(scene.durationIntentSeconds === undefined ? {} : { durationIntentSeconds: scene.durationIntentSeconds }),
        ...(scene.mood ? { mood: scene.mood } : {}),
        charactersPresent: scene.charactersPresent,
        sourceRefs: unique([...scene.sourceRefs, ...beats.flatMap((beat) => beat.sourceRefs)]),
        beats,
      };
    }),
  }));

  expectedEventIds.forEach((eventId) => {
    if (!selectedEventIds.has(eventId)) issues.push(`unused_treatment_visual_event:${eventId}`);
  });
  if (issues.length > 0) throw new ScriptSidecarV3TreatmentError(issues);

  const sidecar = {
    sidecarVersion: SCRIPT_SIDECAR_V3_VERSION,
    spokenTextSource: 'beat-lines' as const,
    treatment: {
      treatmentId: input.treatment.treatmentId,
      treatmentVersion: input.treatment.version,
      inputFingerprint: input.treatment.decisionTrace.inputFingerprint,
    },
    characters: canonical.characters,
    acts,
    ...(canonical.briefId ? { briefId: canonical.briefId } : {}),
    sourceRefs: unique([
      ...canonical.sourceRefs,
      ...acts.flatMap((act) => act.narrativeScenes.flatMap((scene) => [
        ...scene.sourceRefs,
        ...scene.beats.flatMap((beat) => [
          ...beat.sourceRefs,
          ...beat.lines.flatMap((line) => line.sourceRefs),
          ...beat.visualEvents.flatMap((event) => event.sourceRefs),
        ]),
      ])),
    ]),
  };
  return parseScriptSidecarV3(sidecar);
}

export function getCanonicalBeatSpokenTextV3(beat: Pick<NarrativeBeatV3, 'lines'>): string {
  return beat.lines
    .filter((line) => line.delivery !== 'on-screen-text')
    .map((line) => line.text)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function parseScriptSidecarV3(input: unknown): ScriptSidecarV3 {
  return ScriptSidecarV3Schema.parse(input);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
