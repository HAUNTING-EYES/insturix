import { z } from 'zod';
import type { DataBankEntry, ThinkForgeEvent } from '../services/db';

export interface PostMortemInput {
  userId: string;
  orgId?: string | null;
  sessionId: string;
  projectId?: string;
  brandId?: string;
  projectTitle?: string;
  qualityScore?: number;
  userPublished?: boolean;
}

export interface PostMortemResult {
  summaryEntryId: string | null;
  lessonsExtracted: number;
  eventsDeleted: number;
  entriesDeleted: number;
}

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
