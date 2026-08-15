import { z } from 'zod';
import type { DataBankEntry, ThinkForgeEvent } from '../services/db';

export const POST_MORTEM_PREPARED_PLAN_VERSION = 1;

export const PostMortemInputSchema = z.object({
  userId: z.string().trim().min(1).max(256),
  orgId: z.string().trim().min(1).max(256).nullable().optional(),
  sessionId: z.string().trim().min(1).max(256),
  projectId: z.string().trim().min(1).max(256).optional(),
  brandId: z.string().trim().min(1).max(256).optional(),
  projectTitle: z.string().trim().min(1).max(2_000).optional(),
  qualityScore: z.number().finite().min(0).max(100).optional(),
  userPublished: z.boolean().optional(),
});

export type PostMortemInput = z.infer<typeof PostMortemInputSchema>;

export const PostMortemResultSchema = z.object({
  summaryEntryId: z.string().trim().min(1).max(256).nullable(),
  lessonsExtracted: z.number().int().nonnegative(),
  eventsDeleted: z.number().int().nonnegative(),
  entriesDeleted: z.number().int().nonnegative(),
}).strict();

export type PostMortemResult = z.infer<typeof PostMortemResultSchema>;

export const PostMortemCompressionSchema = z.object({
  projectSummary: z.string().trim().min(1).max(2_000).describe(
    'A concise 2-4 sentence summary of what this project accomplished and the key decisions made.',
  ),
  lessons: z.array(z.object({
    insight: z.string().trim().min(1).max(1_000).describe(
      'A specific, evidence-backed learning candidate from this project.',
    ),
    category: z.enum([
      'voice_preference',
      'content_rule',
      'structural_habit',
      'audience_insight',
      'workflow_pattern',
    ]),
  })).max(20).describe(
    'Project learning candidates. They are not permanent brand rules until an owner approves promotion.',
  ),
});

export type PostMortemCompressionOutput = z.infer<typeof PostMortemCompressionSchema>;

export const PostMortemPreparedPlanSchema = z.object({
  version: z.number().int().default(POST_MORTEM_PREPARED_PLAN_VERSION).refine(
    (version) => version === POST_MORTEM_PREPARED_PLAN_VERSION,
    'Unsupported post-mortem prepared-plan version.',
  ),
  userId: z.string().trim().min(1).max(256),
  orgId: z.string().trim().min(1).max(256).nullable(),
  sessionId: z.string().trim().min(1).max(256),
  projectId: z.string().trim().min(1).max(256).nullable(),
  brandId: z.string().trim().min(1).max(256).nullable(),
  projectTitle: z.string().trim().min(1).max(2_000).nullable(),
  qualityScore: z.number().finite().min(0).max(100).nullable(),
  userPublished: z.boolean(),
  sourceEvidenceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sourceEventIds: z.array(z.string().trim().min(1).max(256)).max(200),
  sourceEntryIds: z.array(z.string().trim().min(1).max(256)).max(100),
  output: PostMortemCompressionSchema.nullable(),
});

export type PostMortemPreparedPlan = z.infer<typeof PostMortemPreparedPlanSchema>;

export interface PostMortemLessonStorage {
  dataBankScope: 'project';
  memoryScope: 'project';
  reason: 'awaiting_owner_promotion' | 'unbranded_project_only';
}

export function resolvePostMortemLessonStorage(input: PostMortemInput): PostMortemLessonStorage {
  return {
    dataBankScope: 'project',
    memoryScope: 'project',
    reason: input.brandId ? 'awaiting_owner_promotion' : 'unbranded_project_only',
  };
}

export function buildPostMortemMemoryTags(
  baseTags: string[],
  storage: PostMortemLessonStorage | {
    dataBankScope: 'project';
    memoryScope: 'project';
    reason: 'project_summary';
  },
  input: PostMortemInput,
): string[] {
  return [
    ...baseTags,
    `memory:${storage.memoryScope}`,
    `promotion:${storage.reason}`,
    input.brandId ? `brand:${input.brandId}` : undefined,
    input.projectId ? `project:${input.projectId}` : undefined,
  ].filter((tag): tag is string => Boolean(tag));
}

export function postMortemEventsToText(events: ThinkForgeEvent[]): string {
  if (events.length === 0) return 'No interaction events recorded.';
  return events
    .slice(0, 50)
    .map((event) => {
      const detail = event.payload?.reason || event.payload?.feedback || event.payload?.deletedText || '';
      return `[${event.type}] ${detail}`.trim();
    })
    .join('\n');
}

export function postMortemEntriesToText(entries: DataBankEntry[]): string {
  if (entries.length === 0) return 'No project entries.';
  return entries
    .slice(0, 30)
    .map((entry) => `[${entry.type}] ${entry.title}: ${dataBankContentPreview(entry)}`)
    .join('\n');
}

function dataBankContentPreview(entry: DataBankEntry): string {
  const content: unknown = entry.content;
  if (typeof content === 'string') return content.slice(0, 150);
  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>;
    return String(record.claim ?? record.summary ?? entry.title).slice(0, 150);
  }
  return entry.title.slice(0, 150);
}
