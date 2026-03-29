import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createModelByTier, ModelTier } from '@/lib/thinkforge/agents/model-factory';
import { addDataBankEntry, type DataBankScope } from '@/lib/thinkforge/services/db';
import { embedDataBankEntry, checkDuplicateBeforeSave } from '@/lib/thinkforge/services/embedding-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const extractionSchema = z.object({
  facts: z.array(z.object({
    type: z.enum(['preference', 'rule', 'structural_habit', 'technical_fact', 'audience_insight', 'personal_info']),
    content: z.string().describe('The extracted atomic fact or preference'),
    confidence: z.number().min(0).max(1),
    scope: z.enum(['project', 'global']).describe('project = relevant only to current work; global = evergreen user preference'),
  })),
});

/**
 * Observer API — Zero-latency background fact extraction
 *
 * POST /api/services/thinkforge/events/observe
 *
 * Receives a text buffer from the editor during typing lulls.
 * Uses Tier-1 (Flash-Lite) to extract preferences, rules, and facts.
 * Returns 202 immediately; extraction and storage happen asynchronously.
 */
export async function POST(req: Request) {
  // SECOND BRAIN DISABLED
  if (true) {
    return NextResponse.json({ accepted: true, disabled: true }, { status: 202 });
  }

  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { text, sessionId, source } = body;
  if (!text || typeof text !== 'string' || text.trim().length < 50) {
    return NextResponse.json({ accepted: true, reason: 'too_short_or_invalid' }, { status: 202 });
  }

  // Cost Optimization: Skip if text is nearly identical to what we just processed
  // (This prevents redundant calls when the user is just idling or making tiny edits)
  processObservation(userId, text.trim(), sessionId, source).catch((err) =>
    console.error('[Observer] Background extraction failed:', err),
  );

  return NextResponse.json({ accepted: true }, { status: 202 });
}

async function processObservation(
  userId: string,
  text: string,
  sessionId?: string,
  source?: string,
) {
  let model;
  try {
    model = createModelByTier(ModelTier.Structural);
  } catch {
    const { createThinkForgeModel } = await import('@/lib/thinkforge/agents/model-factory');
    model = createThinkForgeModel('gemini-2.5-flash');
  }

  const { object } = await generateObject({
    model,
    schema: extractionSchema,
    prompt: `You are a silent observer extracting actionable facts from a user's writing or chat session.
Analyze the following text and extract ALL clear facts: user preferences, rules, personal info, structural habits, technical claims, or audience insights.
Even short statements like "my name is X" or "I like Y" are valid facts. Extract them with confidence >= 0.5.
Extract personal info (name, role, channel name), preferences, rules, habits, and opinions.
If a preference is universal (e.g. "I hate puns", "my name is X"), mark scope as "global". If project-specific, mark "project".

Text from ${source || 'editor'}:
"""
${text.slice(0, 1500)}
"""`,
    temperature: 0.1,
  });

  console.log('[Observer] Raw extraction result:', JSON.stringify(object.facts?.map(f => ({ type: f.type, content: f.content.slice(0, 60), confidence: f.confidence, scope: f.scope }))));

  if (!object.facts || object.facts.length === 0) {
    console.log('[Observer] No facts extracted from text:', text.slice(0, 80));
    return;
  }

  const highConfidence = object.facts.filter((f) => f.confidence >= 0.5);
  console.log(`[Observer] ${highConfidence.length}/${object.facts.length} facts passed confidence filter`);

  for (const fact of highConfidence) {
    const entryType = fact.type === 'preference' || fact.type === 'rule' || fact.type === 'personal_info'
      ? 'brand_insight' as const
      : 'atomic_fact' as const;

    const isDuplicate = await checkDuplicateBeforeSave(userId, fact.content, fact.scope as DataBankScope);
    if (isDuplicate) {
      console.log('[Observer] Duplicate skipped:', fact.content.slice(0, 60));
      continue;
    }

    const entry = await addDataBankEntry(sessionId || '', userId, {
      type: entryType,
      title: fact.content.slice(0, 120),
      content: {
        claim: fact.content,
        factType: fact.type,
        confidence: fact.confidence,
        source: source || 'observer',
      },
      tags: [fact.type, 'auto-extracted'],
      scope: fact.scope as DataBankScope,
    });

    console.log('[Observer] Saved fact:', fact.content.slice(0, 60), '| scope:', fact.scope, '| id:', (entry as any)._id);
    embedDataBankEntry(entry).catch((err) => console.error('[Observer] Embedding failed:', err));
  }
}
