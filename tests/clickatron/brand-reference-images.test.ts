import { describe, it, expect } from 'vitest';
import {
  clickatronBrandImageIntentFromMetadata,
  brandProductReferenceImages,
  resolveClickatronBrandReferenceImages,
} from '@/lib/clickatron/brand-reference-images';
import type { BrandSignal, BrandSignalProfile } from '@/lib/shared/brand-signal-profile';

function sig(value: string[], confidence = 0.72): BrandSignal<string[]> {
  return { value, confidence, trustLevel: 'llm_inference', authorityClass: 'inferred_hint', evidenceIds: [] };
}
function profileWith(productImages: BrandSignal<string[]>): BrandSignalProfile {
  return { assets: { productImages } } as unknown as BrandSignalProfile;
}

describe('clickatronBrandImageIntentFromMetadata', () => {
  it('returns product for a handoff product_mockup spec', () => {
    expect(
      clickatronBrandImageIntentFromMetadata({
        clickatron: { creativeSpec: { userIntent: { visualMode: 'product_mockup' } } },
      }),
    ).toBe('product');
  });
  it('returns product for a flat creativeSpec', () => {
    expect(
      clickatronBrandImageIntentFromMetadata({ creativeSpec: { userIntent: { visualMode: 'product_mockup' } } }),
    ).toBe('product');
  });
  it('returns none for any other visual mode (no false positive)', () => {
    for (const mode of ['auto', 'photo', 'illustration', 'text_forward_graphic', 'diagram', 'mixed']) {
      expect(
        clickatronBrandImageIntentFromMetadata({
          clickatron: { creativeSpec: { userIntent: { visualMode: mode } } },
        }),
      ).toBe('none');
    }
  });
  it('returns none for missing/empty metadata', () => {
    expect(clickatronBrandImageIntentFromMetadata(null)).toBe('none');
    expect(clickatronBrandImageIntentFromMetadata(undefined)).toBe('none');
    expect(clickatronBrandImageIntentFromMetadata({})).toBe('none');
  });
});

describe('brandProductReferenceImages', () => {
  it('returns actionable http(s) urls, capped', () => {
    const urls = ['https://cdn.b.com/1.jpg', 'https://cdn.b.com/2.jpg', 'https://cdn.b.com/3.jpg', 'https://cdn.b.com/4.jpg'];
    expect(brandProductReferenceImages(profileWith(sig(urls)), 3)).toEqual(urls.slice(0, 3));
  });
  it('drops a below-floor signal (confidence <= 0.55)', () => {
    expect(brandProductReferenceImages(profileWith(sig(['https://cdn.b.com/1.jpg'], 0.5)))).toEqual([]);
    expect(brandProductReferenceImages(profileWith(sig(['https://cdn.b.com/1.jpg'], 0.55)))).toEqual([]);
  });
  it('filters non-http values', () => {
    expect(
      brandProductReferenceImages(profileWith(sig(['data:image/png;base64,x', 'https://cdn.b.com/ok.jpg', 'ftp://x']))),
    ).toEqual(['https://cdn.b.com/ok.jpg']);
  });
  it('returns [] when assets/profile missing', () => {
    expect(brandProductReferenceImages({} as BrandSignalProfile)).toEqual([]);
    expect(brandProductReferenceImages(null)).toEqual([]);
  });
});

describe('resolveClickatronBrandReferenceImages', () => {
  const productMeta = { clickatron: { creativeSpec: { userIntent: { visualMode: 'product_mockup' } } } };

  it('returns [] and does NOT read the profile when intent is not product', async () => {
    let read = false;
    const out = await resolveClickatronBrandReferenceImages({
      userId: 'u',
      brandId: 'b',
      metadata: { clickatron: { creativeSpec: { userIntent: { visualMode: 'photo' } } } },
      resolveProfile: async () => {
        read = true;
        return profileWith(sig(['https://x/p.jpg']));
      },
    });
    expect(out).toEqual([]);
    expect(read).toBe(false);
  });
  it('returns brand product images for a product mockup', async () => {
    const out = await resolveClickatronBrandReferenceImages({
      userId: 'u',
      brandId: 'b',
      metadata: productMeta,
      resolveProfile: async () => profileWith(sig(['https://cdn.b.com/p1.jpg'])),
    });
    expect(out).toEqual(['https://cdn.b.com/p1.jpg']);
  });
  it('returns [] without a brandId', async () => {
    expect(
      await resolveClickatronBrandReferenceImages({ userId: 'u', brandId: undefined, metadata: productMeta }),
    ).toEqual([]);
  });
  it('fails soft when profile resolution throws', async () => {
    const out = await resolveClickatronBrandReferenceImages({
      userId: 'u',
      brandId: 'b',
      metadata: productMeta,
      resolveProfile: async () => {
        throw new Error('db down');
      },
    });
    expect(out).toEqual([]);
  });
});
