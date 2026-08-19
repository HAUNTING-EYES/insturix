/** Prepare URL-derived learning once, then replay its governed persistence. */

import { z } from 'zod';
import {
  createUrlBriefAgent,
  extractUrlContent,
  UrlBriefSchema,
} from './url-brief-agent';
import { putGovernedDataBankReviewCandidate } from '../services/db';
import { checkDuplicateBeforeSave } from '../services/embedding-service';
import { inspectDataForStorage } from '../privacy/provider-privacy-gateway';

export const REFINERY_PREPARED_PLAN_VERSION = 1;

const RefineryPreparedFactSchema = z.object({
  title: z.string().trim().min(1).max(500),
  content: z.record(z.string(), z.unknown()),
  tags: z.array(z.string().trim().min(1).max(200)).max(50),
}).strict();

const RefineryPreparedSourceSchema = z.object({
  urlIndex: z.number().int().nonnegative(),
  url: z.string().url().max(2_048),
  classification: z.enum(['public', 'business_confidential']),
  brief: UrlBriefSchema,
  facts: z.array(RefineryPreparedFactSchema).max(32),
}).strict();

export const RefineryPreparedPlanSchema = z.object({
  version: z.number().int().default(REFINERY_PREPARED_PLAN_VERSION).refine(
    (value) => value === REFINERY_PREPARED_PLAN_VERSION,
    'Unsupported refinery prepared-plan version.',
  ),
  operationKey: z.string().trim().min(1).max(400),
  userId: z.string().trim().min(1).max(200),
  orgId: z.string().trim().min(1).max(200).nullable(),
  sessionId: z.string().trim().min(1).max(200),
  urls: z.array(z.string().url().max(2_048)).min(1).max(10),
  sources: z.array(RefineryPreparedSourceSchema).max(10),
  errors: z.array(z.object({
    url: z.string().url().max(2_048),
    error: z.string().trim().min(1).max(2_000),
  }).strict()).max(10),
}).strict();

export type RefineryPreparedPlan = z.infer<typeof RefineryPreparedPlanSchema>;
type RefineryPreparedFact = z.infer<typeof RefineryPreparedFactSchema>;
type UrlBrief = z.infer<typeof UrlBriefSchema>;

export interface RefineryInput {
  userId: string;
  orgId: string | null;
  sessionId: string;
  /** Stable durable-job identity used to make every persistence slot idempotent. */
  operationKey: string;
  urls: string[];
}

export interface RefineryResult {
  processed: number;
  failed: number;
  entries: Array<{
    entryId: string;
    url: string;
    title: string;
    factCount: number;
  }>;
  errors: Array<{ url: string; error: string }>;
}

function extractAtomicFacts(brief: UrlBrief, sourceUrl: string): RefineryPreparedFact[] {
  const baseTags = brief.keyTopics.slice(0, 5);
  return [
    {
      title: `Summary: ${(brief.title || sourceUrl).slice(0, 80)}`,
      content: { claim: brief.summary, source: sourceUrl },
      tags: [...baseTags, 'summary'],
    },
    ...brief.keyTopics.map((topic) => ({
      title: `Topic: ${topic}`,
      content: { claim: `Key topic from ${brief.title || sourceUrl}: ${topic}`, source: sourceUrl },
      tags: [topic.toLowerCase(), 'topic'],
    })),
    ...brief.suggestedAngles.map((angle) => ({
      title: `Angle: ${angle.slice(0, 80)}`,
      content: { claim: angle, source: sourceUrl },
      tags: [...baseTags, 'angle'],
    })),
    {
      title: `Audience: ${brief.targetAudience}`,
      content: { claim: `Target audience: ${brief.targetAudience}`, source: sourceUrl },
      tags: [...baseTags, 'audience'],
    },
  ];
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim().slice(0, 2_000)
    : 'Unknown refinery error';
}

async function prepareSource(
  url: string,
  urlIndex: number,
  input: Pick<RefineryInput, 'userId' | 'orgId' | 'sessionId'>,
): Promise<z.infer<typeof RefineryPreparedSourceSchema>> {
  const extracted = await extractUrlContent(url);
  if (!extracted.bodyText && !extracted.description) throw new Error('No content extracted from URL');

  const brief = await createUrlBriefAgent().generateBrief(extracted);
  const storageInspection = inspectDataForStorage({ text: JSON.stringify(brief) });
  if (storageInspection.privacyClass === 'child_data') {
    throw new Error('Source contains child data and cannot be stored without an approved consent workflow.');
  }
  if (storageInspection.containsPersonalData || storageInspection.privacyClass === 'personal') {
    throw new Error('Source contains personal data and cannot be stored without explicit consent.');
  }

  const facts: RefineryPreparedFact[] = [];
  for (const fact of extractAtomicFacts(brief, url)) {
    const claimText = typeof fact.content.claim === 'string' ? fact.content.claim : fact.title;
    const isDuplicate = await checkDuplicateBeforeSave({
      principal: { userId: input.userId, orgId: input.orgId },
      scope: 'project',
      sessionId: input.sessionId,
    }, claimText);
    if (!isDuplicate) facts.push(fact);
  }

  return RefineryPreparedSourceSchema.parse({
    urlIndex,
    url,
    classification: storageInspection.privacyClass,
    brief,
    facts,
  });
}

/** Run provider-backed extraction without mutating DataBank. */
export async function prepareRefineryPlan(input: RefineryInput): Promise<RefineryPreparedPlan> {
  const operationKey = input.operationKey.trim();
  if (!operationKey) throw new Error('Refinery processing requires a stable operation key.');

  const results = await Promise.allSettled(
    input.urls.map((url, urlIndex) => prepareSource(url, urlIndex, input)),
  );
  const sources: RefineryPreparedPlan['sources'] = [];
  const errors: RefineryPreparedPlan['errors'] = [];
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.status === 'fulfilled') sources.push(result.value);
    else errors.push({ url: input.urls[index], error: errorMessage(result.reason) });
  }

  return RefineryPreparedPlanSchema.parse({
    version: REFINERY_PREPARED_PLAN_VERSION,
    operationKey,
    userId: input.userId,
    orgId: input.orgId,
    sessionId: input.sessionId,
    urls: input.urls,
    sources,
    errors,
  });
}

async function commitPreparedSource(
  plan: RefineryPreparedPlan,
  source: RefineryPreparedPlan['sources'][number],
): Promise<RefineryResult['entries'][number]> {
  const principal = { userId: plan.userId, orgId: plan.orgId };
  const parentEntry = await putGovernedDataBankReviewCandidate(
    principal,
    plan.sessionId,
    `${plan.operationKey}:source:${source.urlIndex}:brief`,
    {
      type: 'url_brief',
      title: source.brief.title || source.url,
      content: source.brief,
      sourceUrl: source.url,
      tags: source.brief.keyTopics,
      projectId: plan.sessionId,
      scope: 'project',
      governance: { classification: source.classification, consentStatus: 'not_required' },
    },
  );

  for (let factIndex = 0; factIndex < source.facts.length; factIndex++) {
    const fact = source.facts[factIndex];
    await putGovernedDataBankReviewCandidate(
      principal,
      plan.sessionId,
      `${plan.operationKey}:source:${source.urlIndex}:fact:${factIndex}`,
      {
        type: 'atomic_fact',
        title: fact.title,
        content: fact.content,
        sourceUrl: source.url,
        sourceEntryId: parentEntry._id,
        tags: fact.tags,
        projectId: plan.sessionId,
        scope: 'project',
        governance: { classification: source.classification, consentStatus: 'not_required' },
      },
    );
  }

  return {
    entryId: parentEntry._id,
    url: source.url,
    title: source.brief.title || source.url,
    factCount: source.facts.length,
  };
}

/** Persist one checkpointed plan. Replays never call the model or alter slots. */
export async function commitRefineryPlan(rawPlan: unknown): Promise<RefineryResult> {
  const plan = RefineryPreparedPlanSchema.parse(rawPlan);
  const results = await Promise.allSettled(
    plan.sources.map((source) => commitPreparedSource(plan, source)),
  );
  const failures = results.flatMap((result, index) => result.status === 'rejected'
    ? [`${plan.sources[index].url}: ${errorMessage(result.reason)}`]
    : []);
  if (failures.length > 0) throw new Error(`Refinery candidate commit failed: ${failures.join('; ')}`);

  const entries = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  return {
    processed: entries.length,
    failed: plan.errors.length,
    entries,
    errors: plan.errors,
  };
}

/** Convenience path for non-durable callers and deterministic tests. */
export async function runRefineryAgent(input: RefineryInput): Promise<RefineryResult> {
  return commitRefineryPlan(await prepareRefineryPlan(input));
}
