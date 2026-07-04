import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as GENERATE_REFERENCES } from '@/app/api/services/pipeline/reference-images/generate/route';
import { POST as ADD_SUBJECT } from '@/app/api/services/pipeline/reference-images/[refSetId]/add-subject/route';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  saveReferenceImageSet: vi.fn(),
  getReferenceImageSet: vi.fn(),
  addSubjectToRefSet: vi.fn(),
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
  getReferenceImageSet: mocks.getReferenceImageSet,
  addSubjectToRefSet: mocks.addSubjectToRefSet,
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

function params(refSetId = 'refs_canary') {
  return { params: Promise.resolve({ refSetId }) } as any;
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

function stringSignal(value: string, confidence = 0.95) {
  return {
    value,
    confidence,
    trustLevel: 'first_party_website',
    authorityClass: 'brand_fact',
    evidenceIds: ['e_brand_name'],
  };
}

function acceptedProfileWithEvidence() {
  return {
    identity: {
      brandName: stringSignal('Insturix'),
    },
    assets: {
      productImages: imageSignal(['https://brand.example/product.png']),
      socialPreviewImages: imageSignal([
        'https://brand.example/product.png',
        'https://brand.example/site-preview.png',
      ]),
    },
  };
}

function acceptedReviewPayloadWithLogo() {
  return {
    visualIdentity: {
      colors: [],
      fonts: [],
      images: [],
      logos: [
        {
          kind: 'logo',
          label: 'Insturix Logo',
          url: 'https://brand.example/insturix-logo.svg',
          confidence: 0.94,
          signalPath: 'assets.logoCandidates',
          sourceType: 'uploaded_asset',
        },
      ],
    },
  };
}

function acceptedReviewPayloadWithVisualImages() {
  return {
    visualIdentity: {
      colors: [],
      fonts: [],
      logos: [],
      images: [
        {
          kind: 'uploaded_asset',
          label: 'Uploaded Insturix platform screenshot',
          url: 'https://brand.example/uploaded-platform.png',
          confidence: 0.93,
          sourceType: 'uploaded_asset',
        },
        {
          kind: 'website_preview',
          label: 'Insturix website screenshot',
          url: 'https://brand.example/website-shot.png',
          confidence: 0.9,
          sourceType: 'website',
        },
      ],
    },
  };
}

describe('reference image brand evidence route canary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_refs' });
    mocks.nanoid.mockReturnValue('canary');
    mocks.saveReferenceImageSet.mockResolvedValue(undefined);
    mocks.getReferenceImageSet.mockResolvedValue({
      refSetId: 'refs_canary',
      userId: 'user_refs',
      brandId: 'brand_refs',
      subjects: [],
      status: 'ready',
      createdAt: new Date('2026-07-03T00:00:00.000Z'),
      updatedAt: new Date('2026-07-03T00:00:00.000Z'),
    });
    mocks.addSubjectToRefSet.mockResolvedValue(undefined);
    mocks.getBalance.mockResolvedValue({ totalCredits: 100 });
    mocks.deductCredits.mockResolvedValue({ success: true });
    mocks.createReferenceImageBatch.mockResolvedValue({ batchId: 'batch_canary' });
    mocks.resolveEffectiveBrandWithProfile.mockResolvedValue({
      brand: { name: 'Insturix' },
      acceptedProfile: acceptedProfileWithEvidence(),
    });
  });

  it('uses accepted product evidence first, website evidence second, then rotates without credits', async () => {
    const response = await GENERATE_REFERENCES(request({
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
      brandId: 'brand_refs',
      status: 'ready',
    }));
    expect(mocks.getBalance).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createReferenceImageBatch).not.toHaveBeenCalled();
  });

  it('treats a brand-named platform object as brand-owned instead of generated', async () => {
    const response = await GENERATE_REFERENCES(request({
      brandId: 'brand_refs',
      sourceScriptId: 'script_refs',
      subjects: [
        {
          id: 'platform',
          name: 'Insturix Platform',
          category: 'object',
          visualDescription: 'Insturix dashboard interface with product modules',
          scenesAppearingIn: [1],
        },
      ],
    }) as any);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.subjects[0]).toMatchObject({
      subjectId: 'platform',
      category: 'object',
      imageUrl: 'https://brand.example/product.png',
      referenceProvenance: 'brand-vault',
      requiresBrandEvidence: true,
      brandEvidenceStatus: 'resolved',
    });
    expect(mocks.getBalance).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createReferenceImageBatch).not.toHaveBeenCalled();
  });

  it('uses Brand Vault logo evidence for logo subjects but not product subjects', async () => {
    mocks.resolveEffectiveBrandWithProfile.mockResolvedValue({
      brand: { name: 'Insturix' },
      acceptedProfile: {
        identity: {
          brandName: stringSignal('Insturix'),
        },
        assets: {},
      },
      acceptedReviewPayload: acceptedReviewPayloadWithLogo(),
    });

    const response = await GENERATE_REFERENCES(request({
      brandId: 'brand_refs',
      subjects: [
        { id: 'logo', name: 'Insturix Logo', category: 'object', visualDescription: 'Official Insturix brand logo mark', scenesAppearingIn: [5] },
        { id: 'platform', name: 'Insturix Platform', category: 'product', visualDescription: 'Platform UI', scenesAppearingIn: [1] },
      ],
    }) as any);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('partial');
    expect(body.subjects[0]).toMatchObject({
      subjectId: 'logo',
      imageUrl: 'https://brand.example/insturix-logo.svg',
      source: 'brand-vault-logo',
      referenceProvenance: 'brand-vault',
      requiresBrandEvidence: true,
      brandEvidenceStatus: 'resolved',
    });
    expect(body.subjects[1]).toMatchObject({
      subjectId: 'platform',
      referenceProvenance: 'missing-brand-evidence',
      brandEvidenceStatus: 'missing',
    });
    expect(body.subjects[1].imageUrl).toBeUndefined();
    expect(body.brandReferenceWarnings).toEqual(['Brand evidence required for Insturix Platform']);
    expect(mocks.getBalance).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createReferenceImageBatch).not.toHaveBeenCalled();
  });


  it('uses accepted Brand Vault visual identity images for product references without credits', async () => {
    mocks.resolveEffectiveBrandWithProfile.mockResolvedValue({
      brand: { name: 'Insturix' },
      acceptedProfile: {
        identity: {
          brandName: stringSignal('Insturix'),
        },
        assets: {},
      },
      acceptedReviewPayload: acceptedReviewPayloadWithVisualImages(),
    });

    const response = await GENERATE_REFERENCES(request({
      brandId: 'brand_refs',
      subjects: [
        { id: 'platform', name: 'Insturix Platform', category: 'product', visualDescription: 'Platform UI screenshot', scenesAppearingIn: [1] },
        { id: 'dashboard', name: 'Insturix Dashboard', category: 'product', visualDescription: 'Dashboard UI screenshot', scenesAppearingIn: [2] },
      ],
    }) as any);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.subjects.map((subject: any) => subject.imageUrl)).toEqual([
      'https://brand.example/uploaded-platform.png',
      'https://brand.example/website-shot.png',
    ]);
    expect(body.subjects.map((subject: any) => subject.referenceProvenance)).toEqual([
      'brand-vault',
      'website-screenshot',
    ]);
    expect(body.brandReferenceWarnings).toEqual([]);
    expect(mocks.getBalance).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createReferenceImageBatch).not.toHaveBeenCalled();
  });

  it('keeps brand-owned references missing when accepted image evidence is not actionable', async () => {
    mocks.resolveEffectiveBrandWithProfile.mockResolvedValue({
      brand: { name: 'Insturix' },
      acceptedProfile: {
        identity: {
          brandName: stringSignal('Insturix'),
        },
        assets: {
          socialPreviewImages: imageSignal(['https://brand.example/weak-preview.png'], 0.2),
        },
      },
    });

    const response = await GENERATE_REFERENCES(request({
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

  it('reuses brand evidence for add-subject brand-owned objects without credits or queueing', async () => {
    const response = await ADD_SUBJECT(request({
      name: 'Insturix Platform',
      category: 'object',
      visualDescription: 'Insturix dashboard interface with product modules',
      scenesAppearingIn: [1],
    }) as any, params());

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      async: false,
      brandReferenceWarnings: [],
      subject: {
        subjectId: 'sub_canary',
        name: 'Insturix Platform',
        category: 'object',
        imageUrl: 'https://brand.example/product.png',
        referenceProvenance: 'brand-vault',
        requiresBrandEvidence: true,
        brandEvidenceStatus: 'resolved',
      },
    });
    expect(mocks.addSubjectToRefSet).toHaveBeenCalledWith('refs_canary', expect.objectContaining({
      subjectId: 'sub_canary',
      imageUrl: 'https://brand.example/product.png',
      source: 'brand-vault-product-image',
      requiresBrandEvidence: true,
      brandEvidenceStatus: 'resolved',
    }));
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createReferenceImageBatch).not.toHaveBeenCalled();
  });

  it('stores missing evidence for add-subject brand-owned objects without credits or queueing', async () => {
    mocks.resolveEffectiveBrandWithProfile.mockResolvedValue({
      brand: { name: 'Insturix' },
      acceptedProfile: {
        identity: {
          brandName: stringSignal('Insturix'),
        },
        assets: {
          socialPreviewImages: imageSignal(['https://brand.example/weak-preview.png'], 0.2),
        },
      },
    });

    const response = await ADD_SUBJECT(request({
      name: 'Insturix Platform',
      category: 'object',
      visualDescription: 'Insturix dashboard interface with product modules',
      scenesAppearingIn: [1],
    }) as any, params());

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      async: false,
      brandReferenceWarnings: ['Brand evidence required for Insturix Platform'],
      subject: {
        subjectId: 'sub_canary',
        referenceProvenance: 'missing-brand-evidence',
        brandEvidenceStatus: 'missing',
      },
    });
    expect(body.subject.imageUrl).toBeUndefined();
    expect(mocks.addSubjectToRefSet).toHaveBeenCalledWith('refs_canary', expect.objectContaining({
      subjectId: 'sub_canary',
      referenceProvenance: 'missing-brand-evidence',
      requiresBrandEvidence: true,
      brandEvidenceStatus: 'missing',
    }));
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createReferenceImageBatch).not.toHaveBeenCalled();
  });
});
