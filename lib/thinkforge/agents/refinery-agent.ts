/**
 * Refinery Agent
 *
 * Processes raw content (URLs, text dumps) into "Atomic Facts" stored in
 * the DataBank. Each fact gets its own entry with tags and metadata,
 * ready for embedding and semantic retrieval.
 *
 * This agent is designed to run asynchronously (via QStash worker or
 * direct background call) so it never blocks the chat stream.
 */

import { createUrlBriefAgent, extractUrlContent } from './url-brief-agent';
import {
  addGovernedDataBankEntry,
  type DataBankEntry,
} from '../services/db';
import { embedDataBankEntry, checkDuplicateBeforeSave } from '../services/embedding-service';
import { inspectDataForStorage } from '../privacy/provider-privacy-gateway';

export interface RefineryInput {
  userId: string;
  orgId: string | null;
  sessionId: string;
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

/**
 * Extract atomic facts from a brief object.
 * Splits the brief's data into small, self-contained claims.
 */
function extractAtomicFacts(brief: Record<string, any>, sourceUrl: string): Array<{
  title: string;
  content: Record<string, any>;
  tags: string[];
}> {
  const facts: Array<{ title: string; content: Record<string, any>; tags: string[] }> = [];
  const baseTags = (brief.keyTopics as string[] || []).slice(0, 5);

  if (brief.summary) {
    facts.push({
      title: `Summary: ${(brief.title || sourceUrl).slice(0, 80)}`,
      content: { claim: brief.summary, source: sourceUrl },
      tags: [...baseTags, 'summary'],
    });
  }

  if (Array.isArray(brief.keyTopics)) {
    for (const topic of brief.keyTopics) {
      facts.push({
        title: `Topic: ${topic}`,
        content: { claim: `Key topic from ${brief.title || sourceUrl}: ${topic}`, source: sourceUrl },
        tags: [topic.toLowerCase(), 'topic'],
      });
    }
  }

  if (Array.isArray(brief.suggestedAngles)) {
    for (const angle of brief.suggestedAngles) {
      facts.push({
        title: `Angle: ${angle.slice(0, 80)}`,
        content: { claim: angle, source: sourceUrl },
        tags: [...baseTags, 'angle'],
      });
    }
  }

  if (brief.targetAudience) {
    facts.push({
      title: `Audience: ${brief.targetAudience}`,
      content: { claim: `Target audience: ${brief.targetAudience}`, source: sourceUrl },
      tags: [...baseTags, 'audience'],
    });
  }

  if (Array.isArray(brief.specs)) {
    for (const spec of brief.specs) {
      const specStr = typeof spec === 'string' ? spec : JSON.stringify(spec);
      facts.push({
        title: `Spec: ${specStr.slice(0, 80)}`,
        content: { claim: specStr, source: sourceUrl },
        tags: [...baseTags, 'spec', 'technical'],
      });
    }
  }

  return facts;
}

/**
 * Process a single URL through the refinery pipeline:
 * 1. Extract content
 * 2. Generate structured brief
 * 3. Split into atomic facts
 * 4. Save each fact to DataBank
 */
async function processUrl(
  url: string,
  principal: Pick<RefineryInput, 'userId' | 'orgId'>,
  sessionId: string,
): Promise<{ entryId: string; title: string; factCount: number }> {
  const extracted = await extractUrlContent(url);
  if (!extracted.bodyText && !extracted.description) {
    throw new Error('No content extracted from URL');
  }

  const agent = createUrlBriefAgent();
  const brief = await agent.generateBrief(extracted);
  const storageInspection = inspectDataForStorage({ text: JSON.stringify(brief) });
  if (storageInspection.privacyClass === 'child_data') {
    throw new Error('Source contains child data and cannot be stored without an approved consent workflow.');
  }
  if (storageInspection.containsPersonalData || storageInspection.privacyClass === 'personal') {
    throw new Error('Source contains personal data and cannot be stored without explicit consent.');
  }

  const parentEntry = await addGovernedDataBankEntry(principal, sessionId, {
    type: 'url_brief',
    title: brief.title || url,
    content: brief,
    sourceUrl: url,
    tags: brief.keyTopics || [],
    projectId: sessionId,
    scope: 'project',
    governance: {
      classification: storageInspection.privacyClass,
      consentStatus: 'not_required',
    },
  });

  const atomicFacts = extractAtomicFacts(brief, url);
  let savedCount = 0;
  const savedEntries: DataBankEntry[] = [parentEntry];

  for (const fact of atomicFacts) {
    try {
      const claimText = typeof fact.content.claim === 'string' ? fact.content.claim : fact.title;
      const isDuplicate = await checkDuplicateBeforeSave({
        principal,
        scope: 'project',
        sessionId,
      }, claimText);
      if (isDuplicate) continue;

      const factEntry = await addGovernedDataBankEntry(principal, sessionId, {
        type: 'atomic_fact',
        title: fact.title,
        content: fact.content,
        sourceUrl: url,
        sourceEntryId: parentEntry._id,
        tags: fact.tags,
        projectId: sessionId,
        scope: 'project',
        governance: {
          classification: storageInspection.privacyClass,
          consentStatus: 'not_required',
        },
      });
      savedEntries.push(factEntry);
      savedCount++;
    } catch (err) {
      console.warn(`[Refinery] Failed to save atomic fact "${fact.title}":`, err);
    }
  }

  // The durable refinery worker stays alive until every embedding attempt has
  // either succeeded or recorded its retry state in DataBank.
  await Promise.allSettled(savedEntries.map((entry) => embedDataBankEntry(entry)));

  return {
    entryId: parentEntry._id,
    title: brief.title || url,
    factCount: savedCount,
  };
}

/**
 * Run the full refinery pipeline for multiple URLs.
 * Each URL is processed independently; failures don't block others.
 */
export async function runRefineryAgent(input: RefineryInput): Promise<RefineryResult> {
  const results = await Promise.allSettled(
    input.urls.map((url) =>
      processUrl(url, { userId: input.userId, orgId: input.orgId }, input.sessionId),
    ),
  );

  const entries: RefineryResult['entries'] = [];
  const errors: RefineryResult['errors'] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const url = input.urls[i];
    if (result.status === 'fulfilled') {
      entries.push({ url, ...result.value });
    } else {
      errors.push({ url, error: result.reason?.message || 'Unknown error' });
    }
  }

  return {
    processed: entries.length,
    failed: errors.length,
    entries,
    errors,
  };
}
