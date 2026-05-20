/**
 * Voice Signature — Layers 2 + 3 extraction and retrieval.
 *
 * Layer 2 (VoiceFingerprint): Statistical patterns extracted from reference texts.
 * Layer 3 (VoiceExemplars): Signal-aware retrieval for few-shot injection.
 *
 * All extraction is pure code — zero LLM needed.
 * Spec: creative-content-knowledge.md §1.0 (lines 880-960)
 */

import type {
  VoiceFingerprint,
  VoiceExemplar,
  SentenceLength,
  OpeningPattern,
  TransitionStyle,
  ClosingPattern,
  ListStyle,
} from '../services/db';

// ─── Sentence Utilities ──────────────────────────────────────────────

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter(w => w.length > 0).length;
}

function classifySentenceLength(words: number): SentenceLength {
  if (words < 5) return 'fragment';
  if (words < 10) return 'short';
  if (words < 20) return 'medium';
  return 'long';
}

// ─── Layer 2: Fingerprint Extraction ─────────────────────────────────

function extractBigrams(texts: string[]): [string, number][] {
  const bigramCounts = new Map<string, number>();
  let totalBigrams = 0;

  for (const text of texts) {
    const words = text.toLowerCase().replace(/[^a-z'\s-]/g, '').split(/\s+/).filter(w => w.length > 1);
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      bigramCounts.set(bigram, (bigramCounts.get(bigram) || 0) + 1);
      totalBigrams++;
    }
  }

  const stopBigrams = new Set([
    'of the', 'in the', 'to the', 'on the', 'for the', 'and the',
    'is a', 'it is', 'to be', 'at the', 'with the', 'from the',
    'that the', 'by the', 'as a', 'this is', 'will be', 'has been',
  ]);

  return Array.from(bigramCounts.entries())
    .filter(([bigram]) => !stopBigrams.has(bigram))
    .map(([bigram, count]) => [bigram, totalBigrams > 0 ? count / totalBigrams : 0] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
}

function measurePassiveVoice(sentences: string[]): number {
  if (sentences.length === 0) return 0;
  const passivePattern = /\b(am|is|are|was|were|be|been|being)\s+\w+(ed|en|t)\b/i;
  const passiveCount = sentences.filter(s => passivePattern.test(s)).length;
  return passiveCount / sentences.length;
}

function measurePunctuation(text: string): Record<string, number> {
  const sentences = splitSentences(text);
  const count = Math.max(sentences.length, 1);
  return {
    comma: (text.match(/,/g) || []).length / count,
    dash: (text.match(/[—–-]{1,2}/g) || []).length / count,
    semicolon: (text.match(/;/g) || []).length / count,
    ellipsis: (text.match(/\.{3}|…/g) || []).length / count,
    exclamation: (text.match(/!/g) || []).length / count,
    colon: (text.match(/:/g) || []).length / count,
  };
}

function detectSentenceRhythm(sentences: string[]): SentenceLength[] {
  if (sentences.length < 4) return sentences.map(s => classifySentenceLength(wordCount(s)));
  const classified = sentences.map(s => classifySentenceLength(wordCount(s)));
  const windowSize = Math.min(8, classified.length);
  return classified.slice(0, windowSize);
}

function classifyOpening(text: string): OpeningPattern {
  const firstSentence = splitSentences(text)[0] || '';
  if (firstSentence.endsWith('?')) return 'question';
  if (/\d+%|\d+\s*(million|billion|thousand|percent)/i.test(firstSentence)) return 'statistic';
  if (/\b(I |we |my |our )\b.*\b(remember|recall|when|back in|years ago)/i.test(firstSentence)) return 'story';
  if (/\b(imagine|picture|think about|what if)\b/i.test(firstSentence)) return 'scene_set';
  if (/\b(stop|wrong|nobody|myth|lie|truth)\b/i.test(firstSentence)) return 'provocation';
  return 'direct_claim';
}

function classifyTransition(texts: string[]): TransitionStyle {
  const transitionWords = { conjunction: 0, implicit: 0, question: 0, callback: 0 };
  for (const text of texts) {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
    for (let i = 1; i < paragraphs.length; i++) {
      const start = paragraphs[i].trim();
      if (/^(But|And|So|Yet|However|Moreover|Furthermore|Meanwhile)/i.test(start)) {
        transitionWords.conjunction++;
      } else if (start.endsWith('?') || start.startsWith('What') || start.startsWith('How') || start.startsWith('Why')) {
        transitionWords.question++;
      } else if (/\b(remember|earlier|as I said|back to)\b/i.test(start)) {
        transitionWords.callback++;
      } else {
        transitionWords.implicit++;
      }
    }
  }
  const sorted = Object.entries(transitionWords).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[0] || 'implicit';
  const map: Record<string, TransitionStyle> = {
    conjunction: 'conjunction',
    implicit: 'implicit',
    question: 'question_bridge',
    callback: 'callback',
  };
  return map[top] || 'implicit';
}

function classifyClosing(text: string): ClosingPattern {
  const sentences = splitSentences(text);
  const last = sentences[sentences.length - 1] || '';
  if (last.endsWith('?')) return 'callback_open';
  if (/\b(try|start|go|sign up|download|click|join|subscribe)\b/i.test(last)) return 'cta';
  if (/\b(but|unless|until|the real question|remains)\b/i.test(last)) return 'cliffhanger';
  if (/\b(ultimately|at the end|what matters|the point)\b/i.test(last)) return 'reframe';
  return 'landing';
}

function detectListStyle(texts: string[]): ListStyle {
  const counts = { numbered: 0, bulleted: 0, inline: 0, none: 0 };
  for (const text of texts) {
    if (/^\d+[.)]\s/m.test(text)) counts.numbered++;
    else if (/^[-•*]\s/m.test(text)) counts.bulleted++;
    else if (/\b(first|second|third|finally)\b/i.test(text)) counts.inline++;
    else counts.none++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0] as ListStyle;
}

/**
 * Extract a VoiceFingerprint from reference texts.
 * Pure code, zero LLM. Needs 5+ texts for meaningful statistics.
 */
export function extractVoiceFingerprint(referencTexts: string[]): VoiceFingerprint {
  const allSentences = referencTexts.flatMap(t => splitSentences(t));
  const wordCounts = allSentences.map(s => wordCount(s));
  const avg = wordCounts.length > 0
    ? wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length
    : 12;
  const variance = wordCounts.length > 1
    ? Math.sqrt(wordCounts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / wordCounts.length) / Math.max(avg, 1)
    : 0.3;

  const questionCount = allSentences.filter(s => s.trim().endsWith('?')).length;
  const questionFreq = allSentences.length > 0 ? (questionCount / allSentences.length) * 100 : 0;

  const allText = referencTexts.join('\n\n');

  const openingVotes = new Map<OpeningPattern, number>();
  for (const text of referencTexts) {
    const pattern = classifyOpening(text);
    openingVotes.set(pattern, (openingVotes.get(pattern) || 0) + 1);
  }
  const topOpening = Array.from(openingVotes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'direct_claim';

  const closingVotes = new Map<ClosingPattern, number>();
  for (const text of referencTexts) {
    const pattern = classifyClosing(text);
    closingVotes.set(pattern, (closingVotes.get(pattern) || 0) + 1);
  }
  const topClosing = Array.from(closingVotes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'landing';

  return {
    topBigrams: extractBigrams(referencTexts),
    avgWordsPerSentence: Math.round(avg * 10) / 10,
    sentenceLengthVariance: Math.round(variance * 100) / 100,
    passiveVoiceRatio: Math.round(measurePassiveVoice(allSentences) * 100) / 100,
    questionFrequency: Math.round(questionFreq * 10) / 10,
    punctuationProfile: Object.fromEntries(
      Object.entries(measurePunctuation(allText)).map(([k, v]) => [k, Math.round(v * 100) / 100])
    ),
    sentenceRhythm: detectSentenceRhythm(allSentences),
    openingPattern: topOpening,
    transitionStyle: classifyTransition(referencTexts),
    closingPattern: topClosing,
    listStyle: detectListStyle(referencTexts),
    extractedFromCount: referencTexts.length,
  };
}

// ─── Serialization (for prompt injection, ~100 tokens) ───────────────

export function serializeFingerprint(fp: VoiceFingerprint): string {
  const rhythm = fp.sentenceRhythm.join(', ');
  const topPairs = fp.topBigrams.slice(0, 5).map(([b]) => `"${b}"`).join(', ');
  const punctHighlights = Object.entries(fp.punctuationProfile)
    .filter(([, v]) => v > 0.3)
    .map(([k, v]) => `${k}: ${v}/sentence`)
    .join(', ');

  return [
    `<voice_fingerprint samples="${fp.extractedFromCount}">`,
    `  Avg sentence: ${fp.avgWordsPerSentence} words (variance: ${fp.sentenceLengthVariance})`,
    `  Rhythm: ${rhythm}`,
    `  Passive voice: ${Math.round(fp.passiveVoiceRatio * 100)}%`,
    `  Questions: ${fp.questionFrequency} per 100 sentences`,
    punctHighlights ? `  Punctuation: ${punctHighlights}` : null,
    topPairs ? `  Characteristic phrases: ${topPairs}` : null,
    `  Opens with: ${fp.openingPattern}. Transitions: ${fp.transitionStyle}. Closes with: ${fp.closingPattern}`,
    `  Lists: ${fp.listStyle}`,
    `</voice_fingerprint>`,
  ].filter(Boolean).join('\n');
}

// ─── Layer 3: Exemplar Retrieval ─────────────────────────────────────

function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  for (const key of keys) {
    const va = a[key] || 0;
    const vb = b[key] || 0;
    dotProduct += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag > 0 ? dotProduct / mag : 0;
}

/**
 * Retrieve the best-matching exemplars for a given signal profile.
 * Returns 2-3 exemplars sorted by similarity, pinned exemplars always included.
 */
export function retrieveExemplars(
  exemplars: VoiceExemplar[],
  targetSignals: Record<string, number>,
  maxCount: number = 3,
): VoiceExemplar[] {
  if (exemplars.length === 0) return [];

  const pinned = exemplars.filter(e => e.pinned);
  const unpinned = exemplars.filter(e => !e.pinned);

  const scored = unpinned.map(e => ({
    exemplar: e,
    similarity: cosineSimilarity(e.signalProfile, targetSignals) * e.weight,
  }));
  scored.sort((a, b) => b.similarity - a.similarity);

  const remaining = maxCount - pinned.length;
  const selected = [
    ...pinned,
    ...scored.slice(0, Math.max(remaining, 0)).map(s => s.exemplar),
  ];

  return selected.slice(0, maxCount);
}

export function serializeExemplars(exemplars: VoiceExemplar[]): string {
  if (exemplars.length === 0) return '';
  const parts = exemplars.map((e, i) =>
    `<voice_example index="${i + 1}" type="${e.contentType}">\n${e.text.slice(0, 500)}\n</voice_example>`
  );
  return parts.join('\n\n');
}
