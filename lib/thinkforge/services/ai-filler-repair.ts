/**
 * AI-filler self-repair: a bounded, fail-soft post-generation guard for the writers.
 *
 * The writers ban AI filler in the prompt, but at temperature 0.7 a stray banned phrase
 * ("foster", "showcase", "leverage", "delve", "tapestry", "pivotal"...) slips through ~1 in N
 * generations. Rather than blind synonym substitution (which breaks context — "foster care" ->
 * "build care"), we ask the model to rewrite ONCE, removing the exact phrases in context. We only
 * keep the rewrite if it actually reduced filler and isn't degenerate, so this can only improve or
 * no-op — never regress. One extra model call, and only when filler is actually present.
 */
import { generateText } from 'ai';
import { getAntiAiConstraintBundle } from '../data/writing-graph-query';
import { createThinkForgeModel } from '../agents/model-factory';

const FILLER_PATTERNS = getAntiAiConstraintBundle().fillerPatterns.map((pattern) => ({
  regex: new RegExp(pattern.pattern, 'i'),
  label: pattern.label,
}));

export function detectAiFiller(content: string): string[] {
  return FILLER_PATTERNS.filter((f) => f.regex.test(content)).map((f) => f.label);
}

/**
 * Returns the content with banned AI-filler phrases removed via one in-context rewrite, or the
 * original content if there's no filler, the rewrite didn't help, or the call fails.
 */
export async function repairAiFillerContent(
  content: string,
  modelName: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  const hits = detectAiFiller(content);
  if (hits.length === 0) return content;

  try {
    const model = createThinkForgeModel(modelName);
    const { text } = await generateText({
      model,
      prompt: [
        `The copy below contains banned AI-filler phrases: ${hits.join(', ')}.`,
        'Rewrite it to REMOVE every one of those phrases, replacing each with plain, specific language a real practitioner would use.',
        'Preserve ALL facts, numbers, dates, prices, names, URLs, hashtags, structure, markdown, and approximate length. Do NOT add new claims, do NOT change meaning, do NOT add commentary.',
        'Return ONLY the rewritten copy.',
        '',
        'COPY:',
        content,
      ].join('\n'),
      temperature: 0.3,
      // @ts-ignore — seed is supported by the provider; matches base-agent usage.
      seed: 42,
      abortSignal,
    });

    const repaired = text.trim();
    // Keep the rewrite only if it's non-degenerate AND strictly reduced filler.
    if (repaired.length >= content.length * 0.6 && detectAiFiller(repaired).length < hits.length) {
      return repaired;
    }
    return content;
  } catch (error) {
    console.warn('[ThinkForge:FillerRepair] rewrite failed; keeping original:', error);
    return content;
  }
}
