import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  clickatronBrandImageIntentFromMetadata,
  brandLogoReferenceEvidence,
  brandProductReferenceImages,
  resolveClickatronBrandReferenceEvidence,
  resolveClickatronBrandReferenceImages,
  selectClickatronGenerationBrandEvidence,
} from '@/lib/clickatron/brand-reference-images';
import type { BrandSignal, BrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import type { BrandVaultVisualIdentitySummary } from '@/lib/shared/brand-vault-visual-identity';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function sig(value: string[], confidence = 0.72): BrandSignal<string[]> {
  return { value, confidence, trustLevel: 'llm_inference', authorityClass: 'inferred_hint', evidenceIds: [] };
}
function profileWith(productImages?: BrandSignal<string[]>, logoCandidates?: BrandSignal<string[]>): BrandSignalProfile {
  return {
    assets: {
      ...(productImages ? { productImages } : {}),
      ...(logoCandidates ? { logoCandidates } : {}),
    },
  } as unknown as BrandSignalProfile;
}

type LogoPreview = BrandVaultVisualIdentitySummary['logos'][number];

function logoPreview(overrides: Partial<LogoPreview> = {}): LogoPreview {
  return {
    id: 'logo_1',
    kind: 'logo',
    label: 'Logo',
    url: 'https://brand.test/logo.png',
    confidence: 0.9,
    ...overrides,
  } as LogoPreview;
}

function visualIdentityWithLogos(logos: LogoPreview[]): BrandVaultVisualIdentitySummary {
  return { colors: [], fonts: [], logos, images: [] };
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
  it('returns logo for explicit logo metadata and combines it with product intent', () => {
    expect(
      clickatronBrandImageIntentFromMetadata({ creativeSpec: { userIntent: { assetRole: 'logo' } } }),
    ).toBe('logo');
    expect(
      clickatronBrandImageIntentFromMetadata({
        clickatron: { creativeSpec: { userIntent: { visualMode: 'product_mockup', logoRequired: true } } },
      }),
    ).toBe('logo_and_product');
  });
  it('detects a logo requirement declared by any carousel slide prompt', () => {
    expect(
      clickatronBrandImageIntentFromMetadata({
        clickatron: {
          creativeSpec: {
            kind: 'carousel',
            renderPlan: {
              slides: [
                { imagePrompt: 'A clean product close-up' },
                { imagePrompt: 'End card with the official logo in the lower-right corner' },
              ],
            },
          },
        },
      }),
    ).toBe('logo');
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

describe('brandLogoReferenceEvidence', () => {
  it('prefers accepted stored logo URLs and drops unavailable or low-confidence candidates', () => {
    const visualIdentity = visualIdentityWithLogos([
      logoPreview({
        id: 'stored_logo',
        url: 'https://origin.b.com/logo.png',
        confidence: 0.91,
        availability: { status: 'available' },
        storage: { status: 'stored', publicUrl: 'https://cdn.b.com/logo.png' },
      }),
      logoPreview({ id: 'unavailable_logo', url: 'https://cdn.b.com/missing.png', confidence: 0.99, availability: { status: 'unavailable' } }),
      logoPreview({ id: 'weak_logo', url: 'https://cdn.b.com/weak.png', confidence: 0.4, availability: { status: 'available' } }),
    ]);

    const out = brandLogoReferenceEvidence(
      profileWith(undefined, sig(['https://candidate.b.com/logo.svg'])),
      visualIdentity,
      3,
    );

    expect(out.map((item) => item.url)).toEqual(['https://cdn.b.com/logo.png', 'https://candidate.b.com/logo.svg']);
    expect(out[0]).toMatchObject({ assetRole: 'logo', source: 'brand-vault-logo', confidence: 0.91, status: 'available' });
    expect(out[1]).toMatchObject({ assetRole: 'logo', source: 'brand-vault-logo-candidate' });
  });
});

describe('resolveClickatronBrandReferenceImages', () => {
  const productMeta = { clickatron: { creativeSpec: { userIntent: { visualMode: 'product_mockup' } } } };

  it('returns [] and does NOT read the profile when intent is not product or logo', async () => {
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
  it('returns [] without a brandId when only product imagery is requested', async () => {
    expect(
      await resolveClickatronBrandReferenceImages({ userId: 'u', brandId: undefined, metadata: productMeta }),
    ).toEqual([]);
  });
  it('fails soft when product profile resolution throws', async () => {
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

describe('resolveClickatronBrandReferenceEvidence', () => {
  it('returns accepted Brand Vault logo evidence when logo intent is present', async () => {
    const visualIdentity = visualIdentityWithLogos([
      logoPreview({
        url: 'https://origin.b.com/logo.png',
        storage: { status: 'stored', publicUrl: 'https://cdn.b.com/logo.png' },
      }),
    ]);

    const out = await resolveClickatronBrandReferenceEvidence({
      userId: 'u',
      brandId: 'b',
      metadata: {},
      prompt: 'Place the official logo in the lower-right corner',
      resolveBrandEvidence: async () => ({
        acceptedProfile: profileWith(undefined, sig(['https://candidate.b.com/logo.svg'])),
        acceptedReviewPayload: { visualIdentity } as any,
      }),
    });

    expect(out.needsUserInput).toBe(false);
    expect(out.intent.requiresLogo).toBe(true);
    expect(out.evidence.map((item) => item.url)).toEqual(['https://cdn.b.com/logo.png', 'https://candidate.b.com/logo.svg']);
  });

  it('blocks with needs_user_input when logo intent has no accepted logo evidence', async () => {
    const out = await resolveClickatronBrandReferenceEvidence({
      userId: 'u',
      brandId: 'b',
      metadata: {},
      prompt: 'Use the brand logo on the image',
      resolveBrandEvidence: async () => ({ acceptedProfile: profileWith(), acceptedReviewPayload: null }),
    });

    expect(out.needsUserInput).toBe(true);
    expect(out.needsUserInputReason).toContain('needs_user_input');
    expect(out.evidence).toEqual([]);
  });

  it('does not treat logo hallucination guardrails as logo intent', async () => {
    const out = await resolveClickatronBrandReferenceEvidence({
      userId: 'u',
      brandId: undefined,
      metadata: {},
      prompt: 'Do not invent logos or trademarks from text',
    });

    expect(out.intent.requiresLogo).toBe(false);
    expect(out.needsUserInput).toBe(false);
  });

  it('still returns product evidence for product mockups', async () => {
    const out = await resolveClickatronBrandReferenceEvidence({
      userId: 'u',
      brandId: 'b',
      metadata: { clickatron: { creativeSpec: { userIntent: { visualMode: 'product_mockup' } } } },
      resolveBrandEvidence: async () => ({
        acceptedProfile: profileWith(sig(['https://cdn.b.com/p1.jpg'])),
        acceptedReviewPayload: null,
      }),
    });

    expect(out.needsUserInput).toBe(false);
    expect(out.evidence).toEqual([
      expect.objectContaining({ url: 'https://cdn.b.com/p1.jpg', assetRole: 'product', source: 'brand-vault-product-image' }),
    ]);
  });
});

describe('selectClickatronGenerationBrandEvidence', () => {
  const resolution = {
    intent: { requiresLogo: true, requiresProduct: true },
    evidence: [
      { url: 'https://cdn.b.com/logo.png', assetRole: 'logo' as const, source: 'brand-vault-logo' as const },
      { url: 'https://cdn.b.com/product.png', assetRole: 'product' as const, source: 'brand-vault-product-image' as const },
    ],
    needsUserInput: false,
  };

  it('uses product evidence for a fresh product composition but keeps logo on the overlay path', () => {
    expect(
      selectClickatronGenerationBrandEvidence(resolution, {
        hasParentImage: false,
        userReferenceImageCount: 0,
      }),
    ).toEqual([expect.objectContaining({ assetRole: 'product' })]);
  });

  it('uses logo evidence only when an existing image context can preserve the real mark', () => {
    expect(
      selectClickatronGenerationBrandEvidence(resolution, {
        hasParentImage: false,
        userReferenceImageCount: 1,
      }),
    ).toEqual([expect.objectContaining({ assetRole: 'logo' })]);
  });
});

describe('Clickatron Brand Vault wiring contracts', () => {
  it('keeps native session creation wired to active Brand Vault brand without overwriting handoff brandId', () => {
    const store = readRepoFile('stores/useCanvasStore.ts');
    const sessionRoute = readRepoFile('app/api/services/clickatron/session/route.ts');

    expect(store).toContain('getActiveBrandIdFromStorage');
    expect(store).toContain("activeBrandId && !formData.has('brandId')");
    expect(store).toContain("formData.append('brandId', activeBrandId)");
    expect(store).toContain("headers: { 'Idempotency-Key': idempotencyKey }");
    expect(store).toContain("body?.code !== 'REQUEST_IN_PROGRESS'");
    expect(sessionRoute).toContain("brandId: formData.get('brandId')");
    expect(sessionRoute).toContain('brandId: validatedData.brandId');
  });

  it('preflights Brand Vault evidence before billing and forbids worker model drift', () => {
    const canvasStage = readRepoFile('components/dashboard/Clickatron/stages/CanvasStage.tsx');
    const sessionRoute = readRepoFile('app/api/services/clickatron/session/route.ts');
    const worker = readRepoFile('app/api/internal/workers/clickatron/variation/route.ts');

    expect(canvasStage).toContain('const generationBrandId = task.brandId || getActiveBrandIdFromStorage();');
    expect(canvasStage).toContain('sourceContext: { brandId: generationBrandId }');
    expect(sessionRoute.indexOf('resolveClickatronBrandReferenceEvidence({')).toBeLessThan(
      sessionRoute.indexOf('checkCredits(userId'),
    );
    expect(sessionRoute).toContain(
      'referenceImageCount: referenceImages.length + generationBrandEvidence.length',
    );
    expect(worker).toContain('resolveClickatronBrandReferenceEvidence');
    expect(worker).toContain('selectClickatronGenerationBrandEvidence');
    expect(worker).toContain("needsInputError.code = 'NEEDS_USER_INPUT'");
    expect(worker).toContain('logoReferencePolicy');
    expect(worker).toContain("code: 'MODEL_PREFLIGHT_DRIFT'");
    expect(worker).not.toContain('selectedModelId = resolvedModel.modelId');
  });
});
