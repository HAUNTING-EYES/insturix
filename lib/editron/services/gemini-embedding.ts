const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';

export const EDITRON_EMBEDDING_DIMENSIONS = 768;
export const EDITRON_EMBEDDING_MODEL =
  process.env.EDITRON_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;

export async function generateEditronEmbedding(
  text: string,
  options: {
    apiKey?: string;
    taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY';
    title?: string;
  } = {},
): Promise<number[] | null> {
  const normalized = text.trim();
  if (!normalized) return null;

  const apiKey =
    options.apiKey ||
    process.env.GRAPH_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    '';
  if (!apiKey) return null;

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.embedContent({
    model: EDITRON_EMBEDDING_MODEL,
    contents: normalized,
    config: {
      outputDimensionality: EDITRON_EMBEDDING_DIMENSIONS,
      taskType: options.taskType || 'RETRIEVAL_DOCUMENT',
      title: options.title,
    },
  });

  const values = response.embeddings?.[0]?.values ?? null;
  if (!values) return null;
  if (values.length !== EDITRON_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Gemini embedding dimension mismatch: expected ${EDITRON_EMBEDDING_DIMENSIONS}, got ${values.length} from ${EDITRON_EMBEDDING_MODEL}`,
    );
  }
  return values;
}
