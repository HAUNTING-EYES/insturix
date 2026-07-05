/**
 * Post-Mortem Agent
 *
 * Runs when a project session is marked "done" or manually triggered.
 * 1. Reads all interaction events (rejections, deletions, style corrections) for the session.
 * 2. Reads all project-scoped DataBank entries for the session.
 * 3. Deletes transient logs/scraps, then uses Tier-1 (Flash-Lite) to compress
 *    the remaining signal into:
 *    - A project-scoped "Project Summary"
 *    - "Lessons Learned" insights promoted only when brand outcome gates pass
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { createModelByTier, ModelTier } from './model-factory';
import {
  getRecentInteractionEvents,
  getProjectScopedEntries,
  deleteEventsBySession,
  deleteProjectScopedEntries,
  addDataBankEntry,
  type DataBankScope,
  type DataBankEntry,
  type ThinkForgeEvent,
} from '../services/db';
import { embedDataBankEntry } from '../services/embedding-service';
import { readAiSdkUsage, recordThinkForgeDirectCost, safeJsonLength } from '../services/provider-cost-telemetry';

export interface PostMortemInput {
  userId: string;
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

const lessonCategorySchema = z.enum([
  'voice_preference',
  'content_rule',
  'structural_habit',
  'audience_insight',
  'workflow_pattern',
]);

type PostMortemMemoryScope = 'project' | 'brand';

interface LessonPromotion {
  dataBankScope: DataBankScope;
  memoryScope: PostMortemMemoryScope;
  reason: string;
}

const BRAND_MEMORY_QUALITY_THRESHOLD = 70;

const compressionSchema = z.object({
  projectSummary: z.string().describe('A concise 2-4 sentence summary of what this project accomplished and the key decisions made.'),
  lessons: z.array(z.object({
    insight: z.string().describe('A specific, actionable lesson learned from this project'),
    category: lessonCategorySchema,
  })).describe('Key lessons that should be remembered globally across future projects'),
});

function eventsToText(events: ThinkForgeEvent[]): string {
  if (events.length === 0) return 'No interaction events recorded.';
  return events
    .slice(0, 50)
    .map((e) => {
      const detail = e.payload?.reason || e.payload?.feedback || e.payload?.deletedText || '';
      return `[${e.type}] ${detail}`.trim();
    })
    .join('\n');
}

function entriesToText(entries: DataBankEntry[]): string {
  if (entries.length === 0) return 'No project entries.';
  return entries
    .slice(0, 30)
    .map((e) => {
      return `[${e.type}] ${e.title}: ${dataBankContentPreview(e)}`;
    })
    .join('\n');
}

function dataBankContentPreview(entry: DataBankEntry): string {
  const content: unknown = entry.content;
  if (typeof content === 'string') {
    return content.slice(0, 150);
  }
  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>;
    return String(record.claim ?? record.summary ?? entry.title).slice(0, 150);
  }
  return entry.title.slice(0, 150);
}

export async function runPostMortemAgent(input: PostMortemInput): Promise<PostMortemResult> {
  const { userId, sessionId, projectId, brandId, projectTitle } = input;

  // Fetch scoped cross-service brand events (best-effort)
  let brandEventsText = '';
  try {
    const { getEventsByScope } = await import('@/lib/shared/brand-events');
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const brandEvents = await getEventsByScope(userId, {
      projectId,
      brandId,
      sessionId,
      limit: 50,
      since,
    });
    if (brandEvents.length > 0) {
      brandEventsText = brandEvents
        .map((e) => `[${e.service}/${e.type}] ${JSON.stringify(e.payload).slice(0, 200)}`)
        .join('\n');
    }
  } catch {
    // brand events unavailable — proceed with ThinkForge data only
  }

  const [events, projectEntries] = await Promise.all([
    getRecentInteractionEvents(userId, { projectId: sessionId, limit: 200 }),
    getProjectScopedEntries(userId, sessionId, { limit: 100 }),
  ]);

  if (events.length === 0 && projectEntries.length === 0 && !brandEventsText) {
    return { summaryEntryId: null, lessonsExtracted: 0, eventsDeleted: 0, entriesDeleted: 0 };
  }

  const model = createModelByTier(ModelTier.Structural);
  const modelName = 'gemini-2.5-flash';
  // Prompt: XML-structured per Rule 35 (2026-05-14)
  const prompt = `<role>You are a Post-Mortem agent for ThinkForge, a content creation tool.</role>

<task>
A user finished a project${projectTitle ? ` called "${projectTitle}"` : ''}. Extract:
1. Concise project summary (what was built, key creative decisions).
2. Lessons learned: user preferences, rules, or patterns to remember for ALL future projects.
</task>

<rules>
- Only extract genuinely useful, specific insights.
- Do not fabricate or over-generalize.
</rules>

<input_data>
Interaction events (rejections, corrections, deletions):
${eventsToText(events)}

Project knowledge entries:
${entriesToText(projectEntries)}${brandEventsText ? `

Cross-service brand events (overrides, style changes, quality scores):
${brandEventsText}` : ''}
</input_data>`;
  const startedAt = Date.now();
  let object: z.infer<typeof compressionSchema>;

  try {
    const result = await generateObject({
      model,
      schema: compressionSchema,
      prompt,
      temperature: 0.2,
    });
    object = result.object;
    await recordThinkForgeDirectCost({
      status: 'success',
      action: 'post_mortem_compression',
      route: 'lib/thinkforge/agents/post-mortem-agent',
      provider: 'gemini',
      modelName,
      operation: 'llm_structured_direct',
      userId,
      projectId: brandId ?? projectId,
      taskId: sessionId,
      promptChars: prompt.length,
      outputChars: safeJsonLength(object),
      functionMs: Date.now() - startedAt,
      usage: await readAiSdkUsage((result as { usage?: unknown }).usage),
      routePurpose: 'structural',
      privacyClass: 'business_confidential',
      temperature: 0.2,
      sourceKind: 'post_mortem_memory_compression',
      resultCount: object.lessons.length,
      acceptedCount: object.lessons.length + (object.projectSummary ? 1 : 0),
    });
  } catch (error) {
    await recordThinkForgeDirectCost({
      status: 'failed',
      action: 'post_mortem_compression',
      route: 'lib/thinkforge/agents/post-mortem-agent',
      provider: 'gemini',
      modelName,
      operation: 'llm_structured_direct',
      userId,
      projectId: brandId ?? projectId,
      taskId: sessionId,
      promptChars: prompt.length,
      functionMs: Date.now() - startedAt,
      routePurpose: 'structural',
      privacyClass: 'business_confidential',
      temperature: 0.2,
      sourceKind: 'post_mortem_memory_compression',
      error,
    });
    throw error;
  }

  let summaryEntryId: string | null = null;
  let lessonsExtracted = 0;

  const eventsDeleted = await deleteEventsBySession(sessionId, userId);
  const entriesDeleted = await deleteProjectScopedEntries(sessionId, userId);

  if (object.projectSummary) {
    const summaryEntry = await addDataBankEntry(sessionId, userId, {
      type: 'research',
      title: `Project Summary: ${projectTitle || sessionId.slice(0, 8)}`,
      content: {
        summary: object.projectSummary,
        source: 'post-mortem',
        memoryScope: 'project',
        projectId,
        brandId,
      },
      tags: memoryTags(['project-summary', 'auto-compressed'], { memoryScope: 'project', dataBankScope: 'project', reason: 'project_summary' }, input),
      projectId,
      scope: 'project',
    });
    summaryEntryId = summaryEntry._id;
    embedDataBankEntry(summaryEntry).catch(() => {});
  }

  for (const lesson of object.lessons) {
    const promotion = resolveLessonPromotion(input);
    const entry = await addDataBankEntry(sessionId, userId, {
      type: 'brand_insight',
      title: lesson.insight.slice(0, 120),
      content: {
        claim: lesson.insight,
        category: lesson.category,
        source: 'post-mortem',
        memoryScope: promotion.memoryScope,
        promotionReason: promotion.reason,
        projectId,
        brandId,
        qualityScore: input.qualityScore,
        userPublished: input.userPublished === true,
      },
      tags: memoryTags([lesson.category, 'lesson-learned', 'auto-extracted'], promotion, input),
      projectId,
      scope: promotion.dataBankScope,
    });
    embedDataBankEntry(entry).catch(() => {});
    lessonsExtracted++;
  }

  return {
    summaryEntryId,
    lessonsExtracted,
    eventsDeleted,
    entriesDeleted,
  };
}

function resolveLessonPromotion(input: PostMortemInput): LessonPromotion {
  const qualityScore = typeof input.qualityScore === 'number'
    ? input.qualityScore
    : null;
  const passedQualityGate =
    input.userPublished === true ||
    (qualityScore !== null && qualityScore >= BRAND_MEMORY_QUALITY_THRESHOLD);

  if (input.brandId && passedQualityGate) {
    return {
      dataBankScope: 'global',
      memoryScope: 'brand',
      reason: input.userPublished === true
        ? 'published_brand_outcome'
        : 'quality_brand_outcome',
    };
  }

  return {
    dataBankScope: 'project',
    memoryScope: 'project',
    reason: input.brandId
      ? 'brand_without_quality_gate'
      : 'unbranded_project_only',
  };
}

function memoryTags(
  baseTags: string[],
  promotion: LessonPromotion,
  input: PostMortemInput,
): string[] {
  return [
    ...baseTags,
    `memory:${promotion.memoryScope}`,
    `promotion:${promotion.reason}`,
    input.brandId ? `brand:${input.brandId}` : undefined,
    input.projectId ? `project:${input.projectId}` : undefined,
  ].filter((tag): tag is string => Boolean(tag));
}
