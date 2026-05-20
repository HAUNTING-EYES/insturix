/**
 * Quality Scorer — Post-generation constraint detection for ThinkForge output.
 *
 * Runs AFTER the LLM generates. Detects specific violations programmatically
 * (not via prompt — code-level enforcement). Returns a score 0-100 and
 * a list of violations with locations.
 *
 * This is the writing pipeline's equivalent of editron's constraint-enforcer.ts.
 */

import { computeQualityScore, type QualityScore } from './writing-graph-query';

export interface Violation {
  constraintId: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  location?: string;
}

const AI_FILLER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /in today'?s fast[- ]paced/gi, label: 'in today\'s fast-paced' },
  { pattern: /it'?s important to note/gi, label: 'it\'s important to note' },
  { pattern: /let'?s dive in/gi, label: 'let\'s dive in' },
  { pattern: /at the end of the day/gi, label: 'at the end of the day' },
  { pattern: /\bgame[- ]?changer\b/gi, label: 'game-changer' },
  { pattern: /\bcutting[- ]?edge\b/gi, label: 'cutting-edge' },
  { pattern: /\bseamless(?:ly)?\b/gi, label: 'seamless' },
  { pattern: /\brobust\b/gi, label: 'robust' },
  { pattern: /\binnovative\b/gi, label: 'innovative' },
  { pattern: /\bsynergy\b/gi, label: 'synergy' },
  { pattern: /\bcircle back\b/gi, label: 'circle back' },
  { pattern: /work its magic/gi, label: 'work its magic' },
  { pattern: /\bleverage\b/gi, label: 'leverage' },
  { pattern: /\bunlock\b/gi, label: 'unlock' },
  { pattern: /\bempower\b/gi, label: 'empower' },
  { pattern: /take it to the next level/gi, label: 'take it to the next level' },
  { pattern: /\bdelve\b/gi, label: 'delve' },
  { pattern: /\bcomprehensive\b/gi, label: 'comprehensive' },
  { pattern: /\bnuanced\b/gi, label: 'nuanced' },
  { pattern: /\bpivotal\b/gi, label: 'pivotal' },
  { pattern: /\bfundamental(?:ly)?\b/gi, label: 'fundamental' },
  { pattern: /\bfurthermore\b/gi, label: 'furthermore' },
  { pattern: /\bmoreover\b/gi, label: 'moreover' },
];

function detectAiFiller(text: string): Violation[] {
  const violations: Violation[] = [];
  for (const { pattern, label } of AI_FILLER_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const lineNum = text.substring(0, match.index).split('\n').length;
      violations.push({
        constraintId: 'ai_filler_words',
        severity: 'warning',
        message: `AI filler detected: "${label}"`,
        location: `line ~${lineNum}`,
      });
    }
  }
  return violations;
}

function detectUniformSentences(text: string): Violation[] {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length < 5) return [];

  const lengths = sentences.map(s => s.trim().split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const stdDev = Math.sqrt(lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length);
  const variation = mean > 0 ? stdDev / mean : 0;

  if (variation < 0.15) {
    return [{
      constraintId: 'uniform_sentence_length',
      severity: 'warning',
      message: `Uniform sentence length detected (variation ${(variation * 100).toFixed(0)}%, needs >15%). Mean: ${mean.toFixed(0)} words.`,
    }];
  }
  return [];
}

function detectSummaryRestatement(text: string): Violation[] {
  const lines = text.split('\n');
  const lastParagraph = lines.slice(-5).join(' ').toLowerCase();
  if (/in summary|to summarize|in conclusion|we'?ve covered|as we'?ve seen|to recap/i.test(lastParagraph)) {
    return [{
      constraintId: 'summary_restatement',
      severity: 'info',
      message: 'Summary restatement detected at end. Real writers end with resonance, not recitation.',
    }];
  }
  return [];
}

function detectHedgingOverload(text: string): Violation[] {
  const hedges = text.match(/\b(it seems|perhaps|might|could potentially|may be|arguably|to some extent)\b/gi) || [];
  const wordCount = text.split(/\s+/).length;
  const per200 = (hedges.length / wordCount) * 200;

  if (per200 > 3) {
    return [{
      constraintId: 'hedging_overload',
      severity: 'warning',
      message: `Hedging overload: ${hedges.length} hedge phrases in ${wordCount} words (${per200.toFixed(1)} per 200 words, max 3).`,
    }];
  }
  return [];
}

export function scoreContent(text: string): QualityScore & { violations: Violation[] } {
  const violations: Violation[] = [
    ...detectAiFiller(text),
    ...detectUniformSentences(text),
    ...detectSummaryRestatement(text),
    ...detectHedgingOverload(text),
  ];

  const violationIds = violations.map(v => v.constraintId);
  const uniqueIds = [...new Set(violationIds)];
  const qualityScore = computeQualityScore(uniqueIds);

  return {
    ...qualityScore,
    violations,
  };
}
