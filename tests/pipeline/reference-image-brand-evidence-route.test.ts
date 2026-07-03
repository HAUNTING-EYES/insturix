import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/services/pipeline/reference-images/generate/route';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  saveReferenceImageSet: vi.fn(),
  resolveEffectiveBrandWithProfile: vi.fn(),
  getBalance: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
  createReferenceImageBatch: vi.fn(),
  nanoid: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/pipeline/reference-image-db', () => ({
  saveReferenceImageSet: mocks.saveReferenceImageSet,
}));
vi.mock('@/lib/shared/brand-effective-resolver', () => ({
  resolveEffectiveBrandWithProfile: mocks.resolveEffectiveBrandWithProfile,
}));
vi.mock('@/lib/services/creditsService', () => ({
  CreditsService: {
    getBalance: mocks.getBalance,
    deductCredits: mocks.deductCredits,
    refundCredits: mocks.refundCredits,
  },
}));
vi.mock('@/lib/pipeline/reference-image-queue', () => ({
  createReferenceImageBatch: mocks.createReferenceImageBatch,
}));
vi.mock('nanoid', () => ({ nanoid: mocks.nanoid }));
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(() => ({ publishJSON: vi.fn() })),
}));

function request(body: unknown) {
  return { json: async () => body } as any;
}

function imageSignal(value: string[], confidence = 0.72) {
  return {
    value,
    confidence,
    trustLevel: 'first_party_website',
    authorityClass: 'inferred_hint',
    evidenceIds: ['e_assets'],
  };
}

describe('reference image brand evidence route canary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_refs' });
    mocks.nanoid.mockReturnValue('canary');
    mocks.saveReferenceImageSet.mockResolvedValue(undefined);
    mocks.resolveEffectiveBrandWithProfile.mockResolvedValue({
      acceptedProfile: {
        assets: {
          productImages: imageSignal(['https://brand.example/product.png']),
          socialPreviewImages: imageSignal([
            'https://brand.example/product.png',
            'https://brand.example/site-preview.png',
          ]),
        },
      },
    });
  });

  it('uses accepted product evidence first, website evidence second, then rotates without credits', async () => {
    const response = await POST(request({
      brandId: 'brand_refs',
      sourceScriptId: 'script_refs',
      subjects: [
        { id: 'platform', name: 'Insturix Platform', category: 'product', visualDescription: 'Platform UI', scenesAppearingIn: [1] },
        { id: 'dashboard', name: 'Insturix Dashboard', category: 'product', visualDescription: 'Dashboard UI', scenesAppearingIn: [2] },
        { id: 'editor', name: 'Insturix Editor', category: 'product', visualDescription: 'Editor UI', scenesAppearingIn: [3] },
      ],
    }) as any);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      refSetId: 'refs_canary',
      status: 'ready',
      async: false,
      brandReferenceWarnings: [],
    });
    expect(body.subjects.map((subject: any) => subject.imageUrl)).toEqual([
      'https://brand.example/product.png',
      'https://brand.example/site-preview.png',
      'https://brand.example/product.png',
    ]);
    expect(body.subjects.map((subject: any) => subject.referenceProvenance)).toEqual([
      'brand-vault',
      'website-screenshot',
      'brand-vault',
    ]);
    expect(body.subjects.map((subject: any) => subject.source)).toEqual([
      'brand-vault-product-image',
      'website-screenshot',
      'brand-vault-product-image',
    ]);
    expect(mocks.saveReferenceImageSet).toHaveBeenCalledWith(expect.objectContaining({
      refSetId: 'refs_canary',
      status: 'ready',
    }));
    expect(mocks.getBalance).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createReferenceImageBatch).not.toHaveBeenCalled();
  });

  it('keeps brand-owned references missing when accepted image evidence is not actionable', async () => {
    mocks.resolveEffectiveBrandWithProfile.mockResolvedValue({
      acceptedProfile: {
        assets: {
          socialPreviewImages: imageSignal(['https://brand.example/weak-preview.png'], 0.2),
        },
      },
    });

    const response = await POST(request({
      brandId: 'brand_refs',
      subjects: [
        { id: 'platform', name: 'Insturix Platform', category: 'product', visualDescription: 'Platform UI', scenesAppearingIn: [1] },
      ],
    }) as any);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('partial');
    expect(body.subjects[0]).toMatchObject({
      subjectId: 'platform',
      referenceProvenance: 'missing-brand-evidence',
      brandEvidenceStatus: 'missing',
    });
    expect(body.subjects[0].imageUrl).toBeUndefined();
    expect(body.brandReferenceWarnings).toEqual(['Brand evidence required for Insturix Platform']);
    expect(mocks.getBalance).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createReferenceImageBatch).not.toHaveBeenCalled();
  });
});
