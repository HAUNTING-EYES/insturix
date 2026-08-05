import { recordProviderCostEvent } from '@/lib/financials/provider-cost-events';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;
const SEMANTIC_REJECT_THRESHOLD = 0.9;
const SEMANTIC_BORDERLINE_THRESHOLD = 0.84;
const LEXICAL_BORDERLINE_THRESHOLD = 0.35;

export interface IdeaConceptEvidence {
  title: string;
  purpose?: string;
  style?: string;
}

export type IdeaEmbeddingProvider = (
  concepts: readonly string[],
) => Promise<readonly (readonly number[])[] | null>;

export interface IdeaDiversityAssessment {
  issues: string[];
  degraded: boolean;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with', 'your',
  'de', 'del', 'el', 'en', 'la', 'las', 'los', 'para', 'por', 'y',
  'aur', 'hai', 'ka', 'ki', 'ke', 'ko', 'mein', 'par',
]);

export function deriveIdeaGenerationSeed(variationIndex: number, attempt: number): number {
  const variation = Math.max(0, Math.trunc(variationIndex));
  const boundedAttempt = Math.max(0, Math.trunc(attempt));
  if (variation === 0 && boundedAttempt === 0) return 42;

  const identity = `thinkforge-ideas-v1:${variation}:${boundedAttempt}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  // Gemini's generation_config.seed is a signed INT32; the raw FNV-1a hash is unsigned and
  // frequently exceeds 2^31-1 (e.g. 2345774616 -> 400 INVALID_ARGUMENT). Mask to a non-negative
  // int32 range while preserving determinism and per-variation spread.
  return (hash >>> 0) & 0x7fffffff;
}

export async function assessIdeaDiversity(input: {
  ideas: readonly IdeaConceptEvidence[];
  rejectedIdeas: readonly IdeaConceptEvidence[];
  variationIndex: number;
  embeddingProvider?: IdeaEmbeddingProvider;
}): Promise<IdeaDiversityAssessment> {
  const lexicalIssues = findLexicalIssues(input.ideas, input.rejectedIdeas);
  if (input.variationIndex <= 0 && input.rejectedIdeas.length === 0) {
    return { issues: lexicalIssues, degraded: false };
  }

  const concepts = [...input.ideas, ...input.rejectedIdeas].map(conceptText);
  const provider = input.embeddingProvider ?? embedIdeaConcepts;
  let vectors: readonly (readonly number[])[] | null = null;
  try {
    vectors = await provider(concepts);
  } catch {
    vectors = null;
  }

  if (!validVectors(vectors, concepts.length)) {
    return { issues: lexicalIssues, degraded: true };
  }

  const issues = new Set(lexicalIssues);
  const currentCount = input.ideas.length;
  for (let currentIndex = 0; currentIndex < currentCount; currentIndex += 1) {
    for (let priorIndex = 0; priorIndex < input.rejectedIdeas.length; priorIndex += 1) {
      const vectorIndex = currentCount + priorIndex;
      if (semanticallyDuplicate(
        vectors[currentIndex],
        vectors[vectorIndex],
        concepts[currentIndex],
        concepts[vectorIndex],
      )) {
        issues.add(
          `Repeated a rejected idea angle: "${input.ideas[currentIndex].title}" resembles "${input.rejectedIdeas[priorIndex].title}"`,
        );
      }
    }

    for (let otherIndex = 0; otherIndex < currentIndex; otherIndex += 1) {
      if (semanticallyDuplicate(
        vectors[currentIndex],
        vectors[otherIndex],
        concepts[currentIndex],
        concepts[otherIndex],
      )) {
        issues.add(
          `Generated overlapping ideas in one set: "${input.ideas[currentIndex].title}" resembles "${input.ideas[otherIndex].title}"`,
        );
      }
    }
  }

  return { issues: [...issues].slice(0, 6), degraded: false };
}

export function lexicalIdeaSimilarity(left: string, right: string): number {
  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = leftTokens.size + rightTokens.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

async function embedIdeaConcepts(
  concepts: readonly string[],
): Promise<readonly (readonly number[])[] | null> {
  const apiKey = process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    || '';
  if (!apiKey || concepts.length === 0) return null;

  const startedAt = Date.now();
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [...concepts],
      config: {
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    });
    const vectors = response.embeddings?.map((embedding) => embedding.values ?? []) ?? [];
    await recordEmbeddingCost('success', concepts, Date.now() - startedAt);
    return vectors;
  } catch (error) {
    await recordEmbeddingCost('failed', concepts, Date.now() - startedAt, error);
    throw error;
  }
}

async function recordEmbeddingCost(
  status: 'success' | 'failed',
  concepts: readonly string[],
  functionMs: number,
  error?: unknown,
) {
  await recordProviderCostEvent({
    status,
    service: 'thinkforge',
    action: 'idea_diversity',
    route: 'lib/thinkforge/ideas/idea-diversity',
    provider: 'gemini',
    model: EMBEDDING_MODEL,
    operation: 'embed_content',
    units: {
      requestCount: 1,
      bytesIn: new TextEncoder().encode(concepts.join('\n')).length,
      functionMs,
    },
    metadata: {
      conceptCount: concepts.length,
      errorClass: error instanceof Error ? error.name : error ? typeof error : undefined,
    },
  });
}

function findLexicalIssues(
  ideas: readonly IdeaConceptEvidence[],
  rejectedIdeas: readonly IdeaConceptEvidence[],
): string[] {
  const issues = new Set<string>();
  for (let index = 0; index < ideas.length; index += 1) {
    const idea = ideas[index];
    const concept = conceptText(idea);
    for (const priorIdea of rejectedIdeas) {
      const repeatsTitle = lexicalIdeaSimilarity(idea.title, priorIdea.title) >= 0.67;
      const repeatsConcept = lexicalIdeaSimilarity(concept, conceptText(priorIdea)) >= 0.72;
      if (repeatsTitle || repeatsConcept) {
        issues.add(`Repeated a rejected idea angle: "${idea.title}" resembles "${priorIdea.title}"`);
        break;
      }
    }

    for (let otherIndex = 0; otherIndex < index; otherIndex += 1) {
      const otherIdea = ideas[otherIndex];
      const overlapsTitle = lexicalIdeaSimilarity(idea.title, otherIdea.title) >= 0.67;
      const overlapsConcept = lexicalIdeaSimilarity(concept, conceptText(otherIdea)) >= 0.72;
      if (overlapsTitle || overlapsConcept) {
        issues.add(`Generated overlapping ideas in one set: "${idea.title}" resembles "${otherIdea.title}"`);
        break;
      }
    }
  }
  return [...issues].slice(0, 6);
}

function conceptText(idea: IdeaConceptEvidence): string {
  return [idea.title, idea.purpose, idea.style].filter(Boolean).join(' ').trim().slice(0, 640);
}

function normalizedTokens(value: string): Set<string> {
  return new Set(
    value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

function validVectors(
  vectors: readonly (readonly number[])[] | null,
  expectedCount: number,
): vectors is readonly (readonly number[])[] {
  return Boolean(
    vectors
    && vectors.length === expectedCount
    && vectors.every((vector) => vector.length > 0 && vector.every(Number.isFinite)),
  );
}

function semanticallyDuplicate(
  left: readonly number[],
  right: readonly number[],
  leftText: string,
  rightText: string,
): boolean {
  const similarity = cosineSimilarity(left, right);
  return similarity >= SEMANTIC_REJECT_THRESHOLD
    || (similarity >= SEMANTIC_BORDERLINE_THRESHOLD
      && lexicalIdeaSimilarity(leftText, rightText) >= LEXICAL_BORDERLINE_THRESHOLD);
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
