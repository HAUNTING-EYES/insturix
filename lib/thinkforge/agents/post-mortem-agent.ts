/**
 * Post-Mortem Agent
 *
 * Runs when a project session is marked "done" or manually triggered.
 * 1. Reads all interaction events (rejections, deletions, style corrections) for the session.
 * 2. Reads all project-scoped DataBank entries for the session.
 * 3. Uses Tier-1 (Flash-Lite) to compress the raw data into:
 *    - A "Project Summary" (kept as a global entry)
 *    - "Lessons Learned" insights (promoted to global scope)
 * 4. Deletes the transient event logs and project-scoped scraps.
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
  type DataBankEntry,
  type ThinkForgeEvent,
} from '../services/db';
import { embedDataBankEntry } from '../services/embedding-service';

export interface PostMortemInput {
  userId: string;
  sessionId: string;
  projectTitle?: string;
}

export interface PostMortemResult {
  summaryEntryId: string | null;
  lessonsExtracted: number;
  eventsDeleted: number;
  entriesDeleted: number;
}

const compressionSchema = z.object({
  projectSummary: z.string().describe('A concise 2-4 sentence summary of what this project accomplished and the key decisions made.'),
  lessons: z.array(z.object({
    insight: z.string().describe('A specific, actionable lesson learned from this project'),
    category: z.enum(['voice_preference', 'content_rule', 'structural_habit', 'audience_insight', 'workflow_pattern']),
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
      const content = typeof e.content === 'string'
        ? e.content.slice(0, 150)
        : (e.content?.claim || e.content?.summary || e.title).toString().slice(0, 150);
      return `[${e.type}] ${e.title}: ${content}`;
    })
    .join('\n');
}

export async function runPostMortemAgent(input: PostMortemInput): Promise<PostMortemResult> {
  const { userId, sessionId, projectTitle } = input;

  const [events, projectEntries] = await Promise.all([
    getRecentInteractionEvents(userId, { projectId: sessionId, limit: 200 }),
    getProjectScopedEntries(userId, sessionId, { limit: 100 }),
  ]);

  if (events.length === 0 && projectEntries.length === 0) {
    return { summaryEntryId: null, lessonsExtracted: 0, eventsDeleted: 0, entriesDeleted: 0 };
  }

  const model = createModelByTier(ModelTier.Structural);

  const { object } = await generateObject({
    model,
    schema: compressionSchema,
    prompt: `You are a "Post-Mortem" agent for a content creation tool called ThinkForge.
A user just finished a project${projectTitle ? ` called "${projectTitle}"` : ''}. Analyze the session data and extract:
1. A concise project summary (what was built, key creative decisions).
2. Lessons learned: user preferences, rules, or patterns that should be remembered for ALL future projects.

Only extract genuinely useful, specific insights. Do not fabricate or over-generalize.

## Interaction Events (rejections, corrections, deletions)
${eventsToText(events)}

## Project Knowledge Entries
${entriesToText(projectEntries)}`,
    temperature: 0.2,
  });

  let summaryEntryId: string | null = null;
  let lessonsExtracted = 0;

  if (object.projectSummary) {
    const summaryEntry = await addDataBankEntry(sessionId, userId, {
      type: 'research',
      title: `Project Summary: ${projectTitle || sessionId.slice(0, 8)}`,
      content: { summary: object.projectSummary, source: 'post-mortem' },
      tags: ['project-summary', 'auto-compressed'],
      scope: 'global',
    });
    summaryEntryId = summaryEntry._id;
    embedDataBankEntry(summaryEntry).catch(() => {});
  }

  for (const lesson of object.lessons) {
    const entry = await addDataBankEntry(sessionId, userId, {
      type: 'brand_insight',
      title: lesson.insight.slice(0, 120),
      content: {
        claim: lesson.insight,
        category: lesson.category,
        source: 'post-mortem',
      },
      tags: [lesson.category, 'lesson-learned', 'auto-extracted'],
      scope: 'global',
    });
    embedDataBankEntry(entry).catch(() => {});
    lessonsExtracted++;
  }

  const eventsDeleted = await deleteEventsBySession(sessionId, userId);
  const entriesDeleted = await deleteProjectScopedEntries(sessionId, userId);

  return {
    summaryEntryId,
    lessonsExtracted,
    eventsDeleted,
    entriesDeleted,
  };
}
