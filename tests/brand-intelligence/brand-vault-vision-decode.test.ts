import { describe, expect, it, vi } from 'vitest';
import {
  createBrandVaultVisionDecoderFromEnvironment,
  normalizeProductUiModel,
  parseProductUiModel,
} from '@/lib/shared/brand-vault-vision-decode';

const META = { sourceUrl: 'https://insturix.com', screenshotUrls: ['https://cdn/x.png'], model: 'glm-4.6v' };

/** GLM/z.ai returns JSON-mode content — the transport rejects anything that isn't valid JSON, so the mock returns a bare JSON string. */
function chatResponse(jsonContent: string): Response {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: jsonContent } }] }) } as unknown as Response;
}
function imageResponse(): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'image/png' : null) },
    arrayBuffer: async () => new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]).buffer,
  } as unknown as Response;
}

const MODEL_JSON = JSON.stringify({
  brand: { theme: 'dark', bg: '#0B0B0A', accent: '#D4A652', fontFamily: 'Plus Jakarta Sans', vibe: 'warm editorial', gradient: 'null' },
  positioning: { oneLiner: 'Your entire studio', voice: ['direct'], taglines: ['One platform.'] },
  features: ['Script', 'Edit'],
  proofPoints: [],
  screens: [{ name: 'editor', shell: 'editor', whatItShows: 'timeline', keyElements: ['timeline'], regions: [{ name: 'timeline', x: 0.5, y: 2 }] }],
  ahaFlow: ['prompt', 'render', 'video'],
});

function decodeFetch(): typeof fetch {
  return vi.fn(async (url: string) =>
    url.includes('z.ai') || url.includes('completions') ? chatResponse(MODEL_JSON) : imageResponse(),
  ) as unknown as typeof fetch;
}

describe('brand-vault vision decode', () => {
  it('is inert without a z.ai key, or when the provider is off', () => {
    expect(createBrandVaultVisionDecoderFromEnvironment({}, vi.fn())).toBeUndefined();
    expect(
      createBrandVaultVisionDecoderFromEnvironment({ ZAI_API_KEY: 'k', BRAND_VAULT_VISION_DECODE_PROVIDER: 'off' }, vi.fn()),
    ).toBeUndefined();
  });

  it('is enabled by ZAI_API_KEY (the deployed name), GLM_VISION_API_KEY, or GLM_KEY', () => {
    const noop = vi.fn() as unknown as typeof fetch;
    expect(createBrandVaultVisionDecoderFromEnvironment({ ZAI_API_KEY: 'k' }, noop)).toBeDefined();
    expect(createBrandVaultVisionDecoderFromEnvironment({ GLM_VISION_API_KEY: 'k' }, noop)).toBeDefined();
    expect(createBrandVaultVisionDecoderFromEnvironment({ GLM_KEY: 'k' }, noop)).toBeDefined();
  });

  it('decodes screenshots into a Product UI Model (image fetch -> data uri -> GLM -> json)', async () => {
    const decode = createBrandVaultVisionDecoderFromEnvironment({ ZAI_API_KEY: 'k' }, decodeFetch());
    expect(decode).toBeDefined();
    const model = await decode!({ url: 'https://insturix.com', screenshotUrls: ['https://cdn/a.png', 'https://cdn/b.png'] });

    expect(model).toBeTruthy();
    expect(model!.brand?.theme).toBe('dark');
    expect(model!.brand?.accent).toBe('#D4A652');
    expect(model!.brand?.gradient).toBeUndefined(); // "null" string dropped
    expect(model!.positioning?.taglines).toEqual(['One platform.']);
    expect(model!.features).toEqual(['Script', 'Edit']);
    expect(model!.proofPoints).toBeUndefined(); // empty array omitted
    expect(model!.screens?.[0]?.name).toBe('editor');
    // Coordinate clamped to 0..1.
    expect(model!.screens?.[0]?.regions).toEqual([{ name: 'timeline', x: 0.5, y: 1 }]);
    // Provenance is caller-stamped, not from the model.
    expect(model!.sourceUrl).toBe('https://insturix.com');
    expect(model!.model).toBe('glm-4.6v');
  });

  it('fails soft to null on a non-ok GLM response', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('completions') ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response) : imageResponse(),
    ) as unknown as typeof fetch;
    const decode = createBrandVaultVisionDecoderFromEnvironment({ ZAI_API_KEY: 'k' }, fetchFn);
    expect(await decode!({ url: 'https://insturix.com', screenshotUrls: ['https://cdn/a.png'] })).toBeNull();
  });

  it('returns null when there are no valid screenshot urls (never calls the model)', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const decode = createBrandVaultVisionDecoderFromEnvironment({ ZAI_API_KEY: 'k' }, fetchFn);
    expect(await decode!({ url: 'https://insturix.com', screenshotUrls: ['not-a-url'] })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  describe('parseProductUiModel', () => {
    it('extracts the JSON block from surrounding prose/fences and clamps coords', () => {
      const model = parseProductUiModel('```json\n{"brand":{"accent":"#fff"},"screens":[{"name":"a","regions":[{"name":"r","x":-0.2,"y":0.4}]}]}\n```', META);
      expect(model?.brand?.accent).toBe('#fff');
      expect(model?.screens?.[0]?.regions).toEqual([{ name: 'r', x: 0, y: 0.4 }]);
    });
    it('returns null for no JSON, non-object, or content-free model', () => {
      expect(parseProductUiModel('no json here', META)).toBeNull();
      expect(parseProductUiModel('{"features":[]}', META)).toBeNull(); // empty -> no content
    });
  });

  describe('normalizeProductUiModel', () => {
    it('stamps caller provenance and rejects a content-free object', () => {
      expect(normalizeProductUiModel({ features: ['a'] }, META)?.sourceUrl).toBe('https://insturix.com');
      expect(normalizeProductUiModel({}, META)).toBeNull();
      expect(normalizeProductUiModel('not-an-object', META)).toBeNull();
    });
  });
});
