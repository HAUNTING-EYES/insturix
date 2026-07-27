import { describe, expect, it } from 'vitest';
import { EDITRON_EMBEDDING_DIMENSIONS, EDITRON_EMBEDDING_MODEL } from '@/lib/editron/services/gemini-embedding';

describe('Editron Gemini embedding config', () => {
  it('uses the live-supported 768-dimensional Gemini embedding model by default', () => {
    expect(EDITRON_EMBEDDING_MODEL).toBe('gemini-embedding-001');
    expect(EDITRON_EMBEDDING_DIMENSIONS).toBe(768);
  });
});