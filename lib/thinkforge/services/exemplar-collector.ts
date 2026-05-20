/**
 * Passive Voice Exemplar Collector
 *
 * After every successful script save, checks if the content qualifies
 * as a voice exemplar and auto-adds it to the user's BrandDNA.
 * No user action required — the voice library grows from their workflow.
 */

import { extractSignalsFromContext } from '../data/extract-signals';
import { scoreContent } from '../data/quality-scorer';
import { getUserBrandDNA, updateUserBrandDNA, type VoiceExemplar } from './db';

const MIN_CHARS = 200;
const MAX_EXEMPLARS = 10;
const MIN_QUALITY = 80;
const SIMILARITY_THRESHOLD = 0.7;

function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

export async function collectExemplarPassively(
  userId: string,
  content: string,
  contentType: string,
): Promise<void> {
  try {
    if (content.length < MIN_CHARS) return;

    const score = scoreContent(content);
    if (score.score < MIN_QUALITY) return;

    const dna = await getUserBrandDNA(userId);
    const existing = dna?.voiceExemplars ?? [];

    if (existing.length >= MAX_EXEMPLARS) return;

    const isDuplicate = existing.some(e => textSimilarity(e.text, content) > SIMILARITY_THRESHOLD);
    if (isDuplicate) return;

    const signals = extractSignalsFromContext({
      documentType: contentType,
      userPrompt: content.slice(0, 500),
      projectSummary: '',
    });

    const exemplar: VoiceExemplar = {
      id: crypto.randomUUID(),
      text: content.slice(0, 2000),
      signalProfile: signals as Record<string, number>,
      contentType,
      pinned: false,
      weight: 1.0,
    };

    await updateUserBrandDNA(userId, {
      voiceExemplars: [...existing, exemplar],
    });

    console.log(`[ThinkForge:Exemplar] Auto-collected exemplar (${contentType}, quality ${score.score}, ${existing.length + 1}/${MAX_EXEMPLARS})`);
  } catch (e) {
    console.error('[ThinkForge:Exemplar] Passive collection failed:', e);
  }
}
