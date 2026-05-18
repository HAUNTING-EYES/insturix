import { z } from 'zod';

// ── BrandDNA ────────────────────────────────────────────────────────
// Matches BrandDNA interface in lib/thinkforge/services/db.ts:187-194
export const BrandDNAPatchSchema = z.object({
  voiceLock: z.string().optional(),
  nicheMap: z.string().optional(),
  killList: z.array(z.string()).optional(),
  hookArchetypes: z.array(z.string()).optional(),
  structuralHabits: z.array(z.string()).optional(),
  recurringAssets: z.array(z.string()).optional(),
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
  richText: z.record(z.any()).optional(),
  documentType: z.string().optional(),
}).passthrough();

// ── Route-specific schemas ──────────────────────────────────────────

export const ScriptOpSchema = z.object({
  sessionId: z.string().min(1),
  action: z.enum(['get', 'save', 'update']),
  script: ScriptPayloadSchema.optional(),
  baseVersion: z.number().optional(),
}).passthrough();

export const SaveScriptSchema = z.object({
  sessionId: z.string().min(1),
  scriptId: z.string().optional(),
  baseVersion: z.number().optional(),
  script: ScriptPayloadSchema.optional(),
}).passthrough();

export const SaveBlocksSchema = z.object({
  sessionId: z.string().min(1),
  scriptId: z.string().optional(),
  blocks: z.array(ThinkForgeBlockZodSchema).optional(),
  richText: z.record(z.any()).optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  baseVersion: z.number().optional(),
}).passthrough();
