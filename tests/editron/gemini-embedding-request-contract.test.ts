import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  embedContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { embedContent: mocks.embedContent };
  },
}));

import {
  EDITRON_EMBEDDING_DIMENSIONS,
  generateEditronEmbedding,
} from '@/lib/editron/services/gemini-embedding';

function embeddingResponse(): { embeddings: Array<{ values: number[] }> } {
  return { embeddings: [{ values: Array.from({ length: EDITRON_EMBEDDING_DIMENSIONS }, () => 0.1) }] };
}

describe('Editron Gemini embedding request contract', () => {
  beforeEach(() => {
    mocks.embedContent.mockReset();
  });

  it('rejects a title on retrieval-query embeddings before calling Gemini', async () => {
    await expect(generateEditronEmbedding('find the best product scene', {
      apiKey: 'test-key',
      taskType: 'RETRIEVAL_QUERY',
      title: 'Edit intent',
    })).rejects.toThrow('Embedding titles require RETRIEVAL_DOCUMENT');
    expect(mocks.embedContent).not.toHaveBeenCalled();
  });

  it('sends retrieval queries without document-only title metadata', async () => {
    mocks.embedContent.mockResolvedValueOnce(embeddingResponse());

    await generateEditronEmbedding('find the best product scene', {
      apiKey: 'test-key',
      taskType: 'RETRIEVAL_QUERY',
    });

    expect(mocks.embedContent).toHaveBeenCalledWith({
      model: 'gemini-embedding-001',
      contents: 'find the best product scene',
      config: {
        outputDimensionality: EDITRON_EMBEDDING_DIMENSIONS,
        taskType: 'RETRIEVAL_QUERY',
      },
    });
  });

  it('retains titles for retrieval-document embeddings', async () => {
    mocks.embedContent.mockResolvedValueOnce(embeddingResponse());

    await generateEditronEmbedding('a product reveal scene', {
      apiKey: 'test-key',
      taskType: 'RETRIEVAL_DOCUMENT',
      title: 'Scene 4',
    });

    expect(mocks.embedContent).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        taskType: 'RETRIEVAL_DOCUMENT',
        title: 'Scene 4',
      }),
    }));
  });
});

