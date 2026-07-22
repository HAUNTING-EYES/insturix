import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SchemaType, type ResponseSchema } from '@google/generative-ai';
import { extractStructuredFromImages, parseJsonLoose } from '../../lib/vision/extract-structured-from-images';

const schema = z.object({ hair: z.string(), glasses: z.boolean() });
const responseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: { hair: { type: SchemaType.STRING }, glasses: { type: SchemaType.BOOLEAN } },
};
const gen = (text: string) => async () => ({ text });

describe('extractStructuredFromImages', () => {
  it('returns validated, typed data on a clean JSON response', async () => {
    const result = await extractStructuredFromImages(
      { images: [{ data: Buffer.from('x'), mimeType: 'image/png', label: 'front' }], guidance: 'g', responseSchema, schema },
      { generate: gen('{"hair":"short black","glasses":true}') },
    );
    expect(result).toEqual({ ok: true, data: { hair: 'short black', glasses: true }, raw: '{"hair":"short black","glasses":true}' });
  });

  it('parses JSON wrapped in markdown fences', async () => {
    const result = await extractStructuredFromImages(
      { images: [{ data: Buffer.from('x') }], guidance: 'g', responseSchema, schema },
      { generate: gen('```json\n{"hair":"brown","glasses":false}\n```') },
    );
    expect(result.ok && result.data).toEqual({ hair: 'brown', glasses: false });
  });

  it('repairs a truncated JSON object', async () => {
    const result = await extractStructuredFromImages(
      { images: [{ data: Buffer.from('x') }], guidance: 'g', responseSchema, schema },
      { generate: gen('{"hair":"red","glasses":true') },
    );
    expect(result.ok && result.data).toEqual({ hair: 'red', glasses: true });
  });

  it('fails soft (no throw) when the output never matches the schema', async () => {
    const result = await extractStructuredFromImages(
      { images: [{ data: Buffer.from('x') }], guidance: 'g', responseSchema, schema },
      { generate: gen('{"hair":"short"}') }, // missing `glasses`
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('schema');
  });

  it('fails soft when the vision call throws', async () => {
    const result = await extractStructuredFromImages(
      { images: [{ data: Buffer.from('x') }], guidance: 'g', responseSchema, schema },
      { generate: async () => { throw new Error('gemini 500'); } },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('gemini 500');
  });

  it('fetches hosted image URLs → base64 and passes them to the model', async () => {
    const seen: Array<{ images: Array<{ label: string; mimeType: string; base64: string }> }> = [];
    const fetchImage = vi.fn(async () => ({ data: Buffer.from('IMG'), mimeType: 'image/jpeg' }));
    await extractStructuredFromImages(
      { images: [{ imageUrl: 'https://cdn.example.test/x.jpg', label: 'front' }], guidance: 'g', responseSchema, schema },
      { fetchImage, generate: async (req) => { seen.push(req); return { text: '{"hair":"x","glasses":false}' }; } },
    );
    expect(fetchImage).toHaveBeenCalledWith('https://cdn.example.test/x.jpg');
    expect(seen[0].images[0]).toEqual({ label: 'front', mimeType: 'image/jpeg', base64: Buffer.from('IMG').toString('base64') });
  });

  it('uses raw bytes without fetching when data is provided', async () => {
    const fetchImage = vi.fn();
    await extractStructuredFromImages(
      { images: [{ data: Buffer.from('BYTES'), mimeType: 'image/webp' }], guidance: 'g', responseSchema, schema },
      { fetchImage, generate: gen('{"hair":"x","glasses":true}') },
    );
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('fails when no images are supplied', async () => {
    const result = await extractStructuredFromImages({ images: [], guidance: 'g', responseSchema, schema }, {});
    expect(result.ok).toBe(false);
  });
});

describe('parseJsonLoose', () => {
  it('handles clean, fenced, and truncated JSON — undefined on garbage', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('{"a":[1,2')).toEqual({ a: [1, 2] });
    expect(parseJsonLoose('not json at all')).toBeUndefined();
  });
});
