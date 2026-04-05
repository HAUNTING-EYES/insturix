/**
 * Motion Graphics Template Service
 *
 * Provides MongoDB CRUD + text search + NLP slot-fill for the
 * curated motion-graphic template library.
 *
 * The "template-first" approach replaces slow AI HTML generation:
 *   1. Text-search the template DB for the best match
 *   2. Fill {{slot}} variables with AI (Gemini Flash) — ~200ms
 *   3. Fall back to full Gemini generation only if no template matches
 */

import { getDatabase } from '../db/mongodb';
import type { MotionGraphicTemplate } from '../data/motion-graphic-templates';

const COLLECTION = 'motionGraphicTemplates';

// ─────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────

async function collection() {
  const db = await getDatabase();
  return db.collection<MotionGraphicTemplate>(COLLECTION);
}

// ─────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────

/**
 * Get all templates, optionally filtered by category and/or style.
 */
export async function getAllTemplates(filters?: {
  category?: MotionGraphicTemplate['category'];
  style?: MotionGraphicTemplate['style'];
}): Promise<MotionGraphicTemplate[]> {
  const col = await collection();
  const query: Record<string, any> = {};
  if (filters?.category) query.category = filters.category;
  if (filters?.style) query.style = filters.style;
  return col.find(query).toArray() as unknown as MotionGraphicTemplate[];
}

/**
 * Get templates by category.
 */
export async function getTemplatesByCategory(
  category: MotionGraphicTemplate['category'],
): Promise<MotionGraphicTemplate[]> {
  const col = await collection();
  return col.find({ category }).toArray() as unknown as MotionGraphicTemplate[];
}

/**
 * Get a single template by its unique templateId.
 */
export async function getTemplateById(
  templateId: string,
): Promise<MotionGraphicTemplate | null> {
  const col = await collection();
  return col.findOne({ templateId }) as unknown as MotionGraphicTemplate | null;
}

/**
 * Full-text search across tags + semanticDescription.
 * Uses MongoDB $text index for fast retrieval.
 * Falls back to regex search if text index is unavailable.
 */
export async function searchTemplates(
  query: string,
  limit = 5,
): Promise<MotionGraphicTemplate[]> {
  const col = await collection();

  try {
    // Attempt $text search (requires text index)
    const results = await col
      .find(
        { $text: { $search: query } },
        { projection: { score: { $meta: 'textScore' } } },
      )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .toArray();

    if (results.length > 0) {
      return results as unknown as MotionGraphicTemplate[];
    }
  } catch {
    // Text index might not exist — fall through to regex
  }

  // Fallback: case-insensitive regex on tags + semanticDescription + name
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);

  if (words.length === 0) {
    return col.find({}).limit(limit).toArray() as unknown as MotionGraphicTemplate[];
  }

  const orClauses = words.flatMap((word) => [
    { tags: { $regex: word, $options: 'i' } },
    { semanticDescription: { $regex: word, $options: 'i' } },
    { name: { $regex: word, $options: 'i' } },
    { category: { $regex: word, $options: 'i' } },
  ]);

  // Aggregate: match any word, then score by how many words matched
  const pipeline = [
    { $match: { $or: orClauses } },
    {
      $addFields: {
        _score: {
          $sum: words.map((word) => ({
            $add: [
              // Tag match is worth 3 points
              {
                $cond: [
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: '$tags',
                            cond: { $regexMatch: { input: '$$this', regex: word, options: 'i' } },
                          },
                        },
                      },
                      0,
                    ],
                  },
                  3,
                  0,
                ],
              },
              // semanticDescription match is worth 2
              {
                $cond: [
                  { $regexMatch: { input: '$semanticDescription', regex: word, options: 'i' } },
                  2,
                  0,
                ],
              },
              // name match is worth 2
              {
                $cond: [
                  { $regexMatch: { input: '$name', regex: word, options: 'i' } },
                  2,
                  0,
                ],
              },
              // category match is worth 1
              {
                $cond: [
                  { $regexMatch: { input: '$category', regex: word, options: 'i' } },
                  1,
                  0,
                ],
              },
            ],
          })),
        },
      },
    },
    { $sort: { _score: -1 as const } },
    { $limit: limit },
    { $project: { _score: 0 } },
  ];

  return col.aggregate(pipeline).toArray() as unknown as MotionGraphicTemplate[];
}

/**
 * Insert or update a template (upsert by templateId).
 */
export async function upsertTemplate(
  template: MotionGraphicTemplate,
): Promise<void> {
  const col = await collection();
  await col.updateOne(
    { templateId: template.templateId },
    { $set: template },
    { upsert: true },
  );
}

/**
 * Bulk upsert (for seeding).
 */
export async function bulkUpsertTemplates(
  templates: MotionGraphicTemplate[],
): Promise<{ upserted: number; modified: number }> {
  const col = await collection();
  const ops = templates.map((t) => ({
    updateOne: {
      filter: { templateId: t.templateId },
      update: { $set: t },
      upsert: true,
    },
  }));
  const result = await col.bulkWrite(ops);
  return {
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
  };
}

/**
 * Create indexes for efficient querying.
 * Call once during setup or seed.
 */
export async function ensureIndexes(): Promise<void> {
  const col = await collection();

  // Unique index on templateId
  await col.createIndex({ templateId: 1 }, { unique: true, name: 'templateId_unique' });

  // Category + style for filtered queries
  await col.createIndex({ category: 1, style: 1 }, { name: 'category_style' });

  // Full-text index on tags, name, semanticDescription
  try {
    await col.createIndex(
      { tags: 'text', name: 'text', semanticDescription: 'text' },
      {
        name: 'text_search',
        weights: { tags: 10, name: 5, semanticDescription: 3 },
      },
    );
  } catch {
    // Index may already exist with different options — that is fine
    console.warn('[motion-graphics] Text index already exists, skipping recreation.');
  }

  console.log('[motion-graphics] Indexes ensured.');
}

// ─────────────────────────────────────────────────
// NLP Slot Fill
// ─────────────────────────────────────────────────

/**
 * Fill a template's {{slot}} variables using Gemini Flash based on
 * the user's natural-language query and optional additional context.
 *
 * Returns the filled HTML string ready to render.
 */
export async function fillTemplateSlots(
  template: MotionGraphicTemplate,
  query: string,
  context?: string,
): Promise<string> {
  const slotDescriptions = template.slots
    .map((s) => `  - {{${s.name}}} (${s.type}): ${s.description}. Default: "${s.default}"`)
    .join('\n');

  const prompt = `You are a motion graphics slot-filler. Given a user request and a template with {{slot}} variables, return a JSON object mapping each slot name to the value that best matches the user's intent.

TEMPLATE: "${template.name}"
CATEGORY: ${template.category}

SLOTS:
${slotDescriptions}

USER REQUEST: "${query}"${context ? `\nADDITIONAL CONTEXT: "${context}"` : ''}

RULES:
- Return ONLY valid JSON, no markdown, no explanation.
- Every slot MUST be present in the output.
- For slots the user didn't mention, keep the default value.
- For color slots, return valid CSS color strings.
- For number slots, return number values as strings.
- Match the user's language/tone for text slots.

Output JSON:`;

  try {
    // OLD: hardcoded gemini-2.5-flash. NEW: Gemma 4 via factory.
    const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
    const model = await getAnalysisModel();

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Parse JSON (handle markdown code fences)
    const jsonStr = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
    const slotValues: Record<string, string> = JSON.parse(jsonStr);

    // Fill template
    let html = template.htmlTemplate;
    for (const slot of template.slots) {
      const value = slotValues[slot.name] ?? slot.default;
      // Replace all occurrences of {{slotName}}
      html = html.replace(new RegExp(`\\{\\{${slot.name}\\}\\}`, 'g'), String(value));
    }

    return html;
  } catch (err: any) {
    console.error('[motion-graphics] Slot fill error, using defaults:', err.message);
    // Fallback: fill with defaults
    return fillTemplateWithDefaults(template);
  }
}

/**
 * Fill a template using only default slot values (no AI).
 */
export function fillTemplateWithDefaults(template: MotionGraphicTemplate): string {
  let html = template.htmlTemplate;
  for (const slot of template.slots) {
    html = html.replace(new RegExp(`\\{\\{${slot.name}\\}\\}`, 'g'), slot.default);
  }
  return html;
}

/**
 * Compute a rough relevance score (0-1) between a search query and a template.
 * Used by the agent to decide whether to use a template vs. fall back to Gemini.
 */
export function computeRelevanceScore(
  query: string,
  template: MotionGraphicTemplate,
): number {
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return 0;

  let totalScore = 0;
  const maxPossible = words.length * 5; // max 5 points per word

  for (const word of words) {
    // Tag exact match: 5 points
    if (template.tags.some((t) => t.toLowerCase() === word)) {
      totalScore += 5;
      continue;
    }
    // Tag partial match: 3 points
    if (template.tags.some((t) => t.toLowerCase().includes(word))) {
      totalScore += 3;
      continue;
    }
    // Category match: 3 points
    if (template.category.toLowerCase().includes(word)) {
      totalScore += 3;
      continue;
    }
    // Name match: 2 points
    if (template.name.toLowerCase().includes(word)) {
      totalScore += 2;
      continue;
    }
    // Description match: 1 point
    if (template.semanticDescription.toLowerCase().includes(word)) {
      totalScore += 1;
    }
  }

  return Math.min(totalScore / maxPossible, 1);
}

/**
 * High-level: search templates and return the best match with score.
 * Used by tools.ts to decide template vs. fallback.
 */
export async function findBestTemplate(
  query: string,
): Promise<{ template: MotionGraphicTemplate; score: number } | null> {
  const candidates = await searchTemplates(query, 10);
  if (candidates.length === 0) return null;

  let bestTemplate = candidates[0];
  let bestScore = computeRelevanceScore(query, bestTemplate);

  for (let i = 1; i < candidates.length; i++) {
    const score = computeRelevanceScore(query, candidates[i]);
    if (score > bestScore) {
      bestScore = score;
      bestTemplate = candidates[i];
    }
  }

  return { template: bestTemplate, score: bestScore };
}
