import { z } from 'zod';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import type { LLMParseResult, ParsedScene } from '@/lib/pipeline/llm-scene-parser';
import { ThinkForgeBlockZodSchema } from './route-validation';
import type { ThinkForgeBlock } from './thinkforge-block';
import { SourceLedgerSchema, type SourceLedger } from '../provenance/source-ledger';

export const SCRIPT_SIDECAR_VERSION = 1 as const;
export type ScriptSidecarVersion = typeof SCRIPT_SIDECAR_VERSION;

export const CHARACTER_ROLES = [
  'host',
  'narrator',
  'subject',
  'interviewee',
  'expert',
  'other',
] as const;

export const LINE_DELIVERIES = [
  'sync-dialogue',
  'voiceover',
  'on-screen-text',
] as const;

export type CharacterRole = typeof CHARACTER_ROLES[number];
export type LineDelivery = typeof LINE_DELIVERIES[number];

export interface SidecarCharacter {
  id: string;
  name: string;
  role: CharacterRole;
}

export interface SidecarLine {
  text: string;
  speakerId: string;
  onCamera: boolean;
  delivery: LineDelivery;
  sourceRefs?: string[];
}

export interface RelipSafety {
  faceVisibility: 'visible';
  occlusion: 'none' | 'light';
  motion: 'still' | 'moderate';
}

export interface SidecarScene extends ParsedScene {
  lines: SidecarLine[];
  sourceRefs: string[];
  charactersPresent: string[];
  relipSafe?: boolean;
  relipSafety?: RelipSafety;
}

export interface ScriptSidecar extends Omit<LLMParseResult, 'scenes'> {
  sidecarVersion: ScriptSidecarVersion;
  characters: SidecarCharacter[];
  scenes: SidecarScene[];
  briefId?: string;
  sourceRefs: string[];
}

export interface ScriptGenerationResult {
  scriptBlocks: ThinkForgeBlock[];
  sidecar: ScriptSidecar;
  briefSnapshot: ProductionBrief;
  sourceLedger: SourceLedger;
  sidecarVersion: ScriptSidecarVersion;
}

const StringArraySchema = z.array(z.string().min(1));

export const SidecarCharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(CHARACTER_ROLES),
});

export const SidecarLineSchema = z.object({
  text: z.string(),
  speakerId: z.string().min(1),
  onCamera: z.boolean(),
  delivery: z.enum(LINE_DELIVERIES),
  sourceRefs: StringArraySchema.optional(),
});

const RelipSafetySchema: z.ZodType<RelipSafety> = z.object({
  faceVisibility: z.literal('visible'),
  occlusion: z.enum(['none', 'light']),
  motion: z.enum(['still', 'moderate']),
});

const SubShotSchema = z.object({
  description: z.string(),
  startNormalized: z.number().min(0).max(1),
  endNormalized: z.number().min(0).max(1),
  targetDurationSeconds: z.number(),
  narration: z.string().optional(),
  independentGeneration: z.boolean().optional(),
  visualDescription: z.string().optional(),
  videoMotionPrompt: z.string().optional(),
  imageQualityTokens: z.string().optional(),
  videoQualityTokens: z.string().optional(),
}).passthrough();

const EditDirectionsSchema = z.object({
  transition: z.object({
    type: z.string(),
    durationMs: z.number().optional(),
  }).passthrough().optional(),
  filterPresetId: z.string().optional(),
  pacing: z.string().optional(),
  sfxCue: z.string().optional(),
  motionGraphicCue: z.string().optional(),
  onScreenText: z.array(z.string()).optional(),
  cameraRig: z.string().optional(),
}).passthrough();

export const SidecarSceneSchema: z.ZodType<SidecarScene> = z.object({
  title: z.string().min(1),
  narration: z.string(),
  visualDescription: z.string().min(1),
  videoMotionPrompt: z.string(),
  audioDescription: z.string(),
  musicDescription: z.string(),
  sfxDescription: z.string(),
  durationSeconds: z.number(),
  mood: z.enum([
    'energetic',
    'calm',
    'serious',
    'playful',
    'mysterious',
    'dramatic',
    'inspirational',
    'neutral',
  ]),
  imageQualityTokens: z.string(),
  videoQualityTokens: z.string(),
  editDirections: EditDirectionsSchema.optional(),
  generationUnitId: z.string().min(1),
  primaryVisualForUnit: z.boolean(),
  subShots: z.array(SubShotSchema).optional(),
  sceneType: z.enum(['continuous', 'montage', 'logo-reveal', 'text-card', 'talking-head']),
  assetRecommendation: z.enum(['ai-video', 'stock', 'animated-still', 'graphics-only']),
  lines: z.array(SidecarLineSchema).min(1),
  sourceRefs: StringArraySchema,
  charactersPresent: StringArraySchema,
  relipSafe: z.boolean().optional(),
  relipSafety: RelipSafetySchema.optional(),
}).passthrough() as z.ZodType<SidecarScene>;

const GlobalEditDirectionsSchema = z.record(z.string(), z.unknown()).optional();

export const ScriptSidecarSchema: z.ZodType<ScriptSidecar> = z.object({
  // Gemini structured-output response schemas only support STRING enums; a numeric
  // z.literal(1) becomes a numeric enum [1] and Gemini rejects the whole request with
  // 400 "enum[0] (TYPE_STRING), 1". The version is a server-owned constant the model
  // should not author anyway — accept a number, default to the constant when omitted.
  sidecarVersion: z.number().int().default(SCRIPT_SIDECAR_VERSION),
  characters: z.array(SidecarCharacterSchema),
  scenes: z.array(SidecarSceneSchema).min(1).max(60),
  overallMusicPrompt: z.string(),
  characterDescriptions: z.record(z.string(), z.string()),
  colorPalette: z.array(z.string()),
  environmentNotes: z.string(),
  globalEditDirections: GlobalEditDirectionsSchema,
  suggestedProfileCategory: z.enum([
    'platform-native',
    'industry-vertical',
    'content-format',
    'cinematic-style',
    'narrative-mode',
    'production-mode',
    'special-purpose',
  ]),
  briefId: z.string().min(1).optional(),
  sourceRefs: StringArraySchema,
}).passthrough().superRefine((sidecar, ctx) => {
  const characterIds = new Set(sidecar.characters.map((character) => character.id));
  const topLevelSourceRefs = new Set(sidecar.sourceRefs);

  sidecar.scenes.forEach((scene, sceneIndex) => {
    scene.charactersPresent.forEach((characterId, characterIndex) => {
      if (!characterIds.has(characterId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', sceneIndex, 'charactersPresent', characterIndex],
          message: `charactersPresent id "${characterId}" must resolve to characters[].id`,
        });
      }
    });

    const hasOnCameraSpeakingLine = scene.lines.some(
      (line) => line.onCamera && line.delivery === 'sync-dialogue',
    );
    if (hasOnCameraSpeakingLine && typeof scene.relipSafe !== 'boolean') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scenes', sceneIndex, 'relipSafe'],
        message: 'relipSafe must be declared when a scene has on-camera sync dialogue',
      });
    }

    for (const sourceRef of scene.sourceRefs) {
      if (!topLevelSourceRefs.has(sourceRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', sceneIndex, 'sourceRefs'],
          message: `scene sourceRef "${sourceRef}" must be included in top-level sourceRefs`,
        });
      }
    }

    scene.lines.forEach((line, lineIndex) => {
      if (!characterIds.has(line.speakerId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', sceneIndex, 'lines', lineIndex, 'speakerId'],
          message: `speakerId "${line.speakerId}" must resolve to characters[].id`,
        });
      }

      if (line.delivery === 'sync-dialogue' && !line.onCamera) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', sceneIndex, 'lines', lineIndex, 'onCamera'],
          message: 'sync-dialogue lines must be on camera',
        });
      }

      for (const sourceRef of line.sourceRefs ?? []) {
        if (!topLevelSourceRefs.has(sourceRef)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['scenes', sceneIndex, 'lines', lineIndex, 'sourceRefs'],
            message: `line sourceRef "${sourceRef}" must be included in top-level sourceRefs`,
          });
        }
      }
    });
  });
}) as z.ZodType<ScriptSidecar>;

const ProductionBriefSnapshotSchema = z.object({
  output: z.object({
    platform: z.enum([
      'tiktok',
      'instagram-reels',
      'youtube-shorts',
      'instagram-feed',
      'youtube',
      'linkedin',
      'x',
      'unspecified',
    ]),
    targetDurationSec: z.number().nullable().optional(),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5']).optional(),
    count: z.number().int().min(1),
    intent: z.string().optional(),
    style: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
    format: z.enum(['reel', 'auto-edit']),
  }).passthrough(),
  brand: z.object({
    brandId: z.string().nullable().optional(),
  }).nullable().optional(),
  resolution: z.object({
    fieldConfidence: z.record(z.string(), z.number()).optional(),
    confirmed: z.array(z.string()),
    inferred: z.array(z.string()),
  }).passthrough(),
  entryPoint: z.enum(['upload', 'script', 'thinkforge', 'generate', 'idea']),
  sourceDurationSec: z.number().nullable().optional(),
}).passthrough();

export const ScriptGenerationResultSchema: z.ZodType<ScriptGenerationResult> = z.object({
  scriptBlocks: z.array(ThinkForgeBlockZodSchema),
  sidecar: ScriptSidecarSchema,
  briefSnapshot: ProductionBriefSnapshotSchema,
  sourceLedger: SourceLedgerSchema,
  // Same Gemini numeric-enum constraint as ScriptSidecarSchema.sidecarVersion above.
  sidecarVersion: z.number().int().default(SCRIPT_SIDECAR_VERSION),
}).superRefine((result, ctx) => {
  if (result.sidecarVersion !== result.sidecar.sidecarVersion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sidecarVersion'],
      message: 'sidecarVersion must match sidecar.sidecarVersion',
    });
  }
}) as z.ZodType<ScriptGenerationResult>;

export function parseScriptSidecar(input: unknown): ScriptSidecar {
  return ScriptSidecarSchema.parse(input);
}

export function parseScriptGenerationResult(input: unknown): ScriptGenerationResult {
  return ScriptGenerationResultSchema.parse(input);
}
