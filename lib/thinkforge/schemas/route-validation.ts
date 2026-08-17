import { z } from 'zod';
import {
  ThinkForgeDocumentContractSchema,
  normalizeThinkForgeDocumentContract,
} from './document-contract';

// ── BrandDNA ────────────────────────────────────────────────────────
// Matches BrandDNA interface in lib/thinkforge/services/db.ts
const VoiceFingerprintSchema = z.object({
  topBigrams: z.array(z.tuple([z.string(), z.number()])),
  avgWordsPerSentence: z.number(),
  sentenceLengthVariance: z.number(),
  passiveVoiceRatio: z.number(),
  questionFrequency: z.number(),
  punctuationProfile: z.record(z.string(), z.number()),
  sentenceRhythm: z.array(z.enum(['fragment', 'short', 'medium', 'long'])),
  openingPattern: z.enum(['question', 'statistic', 'story', 'provocation', 'scene_set', 'direct_claim']),
  transitionStyle: z.enum(['conjunction', 'implicit', 'question_bridge', 'callback', 'tonal_shift']),
  closingPattern: z.enum(['cta', 'callback_open', 'reframe', 'cliffhanger', 'landing']),
  listStyle: z.enum(['numbered', 'bulleted', 'inline', 'none']),
  extractedFromCount: z.number(),
}).strict();

const VoiceExemplarSchema = z.object({
  id: z.string(),
  text: z.string().max(2000),
  signalProfile: z.record(z.string(), z.number()),
  contentType: z.string(),
  pinned: z.boolean(),
  weight: z.number().min(0).max(5),
}).strict();

export const BrandDNAPatchSchema = z.object({
  voiceLock: z.string().optional(),
  nicheMap: z.string().optional(),
  killList: z.array(z.string()).optional(),
  hookArchetypes: z.array(z.string()).optional(),
  structuralHabits: z.array(z.string()).optional(),
  recurringAssets: z.array(z.string()).optional(),
  voiceFingerprint: VoiceFingerprintSchema.optional(),
  voiceExemplars: z.array(VoiceExemplarSchema).max(10).optional(),
}).passthrough();

// ── ThinkForge Blocks ───────────────────────────────────────────────
// Matches ThinkForgeBlock interface in thinkforge-block.ts
// Kept permissive on `content` (RichTextAST is recursive/complex,
// hand-rolled normalizer in thinkforge-block.ts handles that downstream)
export const ThinkForgeBlockZodSchema = z.object({
  id: z.string().optional(),
  kind: z.enum([
    'header', 'action', 'why', 'example', 'paragraph', 'scene', 'editorial',
  ]).optional(),
  content: z.array(z.any()).optional(),
  blockHash: z.string().optional(),
  meta: z.object({
    role: z.string().optional(),
    goal: z.string().optional(),
    level: z.number().optional(),
  }).passthrough().optional(),
  scene: z.object({
    visualDescription: z.string(),
    subjects: z.array(z.object({
      name: z.string(),
      category: z.enum(['person', 'product', 'location', 'object', 'brand', 'other']),
    }).passthrough()),
    duration: z.number().optional(),
    durationExplicit: z.boolean().optional(),
    mood: z.string().optional(),
    onScreenText: z.array(z.string()).optional(),
    sfxDescription: z.string().optional(),
    musicDescription: z.string().optional(),
  }).passthrough().optional(),
  editorial: z.object({
    editorialType: z.enum([
      'emotional_target', 'instrumentation', 'production_note',
      'style_guide', 'color_palette', 'pacing_note', 'custom',
    ]),
  }).passthrough().optional(),
}).passthrough();

// ── Script Payload ──────────────────────────────────────────────────
// Shape for the `script` field in /script and /script/save routes
// Matches Script interface in db.ts:162-177 (subset used by routes)
export const ScriptPayloadSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  blocks: z.array(ThinkForgeBlockZodSchema).optional(),
  richText: z.record(z.string(), z.any()).optional(),
  documentType: z.string().trim().min(1).optional(),
  contentContract: ThinkForgeDocumentContractSchema.optional(),
}).passthrough().superRefine((payload, ctx) => {
  if (!payload.documentType) return;

  const normalized = normalizeThinkForgeDocumentContract(payload.documentType);
  if (!normalized) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['documentType'],
      message: 'unsupported ThinkForge document type',
    });
    return;
  }

  if (payload.contentContract && (
    payload.contentContract.documentKind !== normalized.documentKind
    || payload.contentContract.outputKind !== normalized.outputKind
    || payload.contentContract.artifactType !== normalized.artifactType
  )) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contentContract'],
      message: 'content contract conflicts with document type',
    });
  }
});

export type ScriptPayload = z.infer<typeof ScriptPayloadSchema>;

const ExactThinkForgeIdSchema = z.string().min(1).refine(
  (value) => value.trim().length > 0 && value.trim() === value,
  { message: 'must be a non-empty trimmed string' },
);

// ── Route-specific schemas ──────────────────────────────────────────

export const ScriptOpSchema = z.object({
  sessionId: ExactThinkForgeIdSchema,
  scriptId: ExactThinkForgeIdSchema,
  action: z.enum(['get', 'save', 'update']),
  script: ScriptPayloadSchema.optional(),
  baseVersion: z.number().int().nonnegative().optional(),
}).passthrough().superRefine((value, ctx) => {
  if ((value.action === 'save' || value.action === 'update') && value.baseVersion === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['baseVersion'],
      message: 'baseVersion is required for document mutations',
    });
  }
});

export const SaveScriptSchema = z.object({
  sessionId: z.string().min(1),
  scriptId: z.string().optional(),
  baseVersion: z.number().int().nonnegative().optional(),
  script: ScriptPayloadSchema.optional(),
}).passthrough();

export const SaveBlocksSchema = z.object({
  sessionId: z.string().min(1),
  scriptId: z.string().optional(),
  blocks: z.array(ThinkForgeBlockZodSchema).optional(),
  richText: z.record(z.string(), z.any()).optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  baseVersion: z.number().int().nonnegative().optional(),
}).passthrough();
