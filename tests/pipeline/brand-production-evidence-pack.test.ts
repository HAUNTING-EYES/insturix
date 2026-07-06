import { describe, expect, it } from 'vitest';
import {
  buildBrandProductionEvidencePack,
  evaluateBrandSubjectEvidence,
  formatBrandProductionEvidencePromptBlock,
} from '@/lib/pipeline/brand-production-evidence-pack';
import {
  deriveBrandSignalProfile,
  type BrandSignal,
  type BrandSignalProfile,
} from '@/lib/shared/brand-signal-profile';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';
import type { BrandVaultVisualIdentitySummary } from '@/lib/shared/brand-vault-visual-identity';

function makeActionable<T>(signal: BrandSignal<T> | undefined): void {
  if (!signal) return;
  signal.confidence = 0.82;
  signal.trustLevel = 'manual_user_entry';
  signal.authorityClass = 'brand_fact';
}

function arraySignal(value: string[], signalPath: string): BrandSignal<string[]> {
  return {
    value,
    confidence: 0.84,
    trustLevel: 'first_party_website',
    authorityClass: 'brand_fact',
    evidenceIds: [`e_${signalPath.replace(/[^a-z0-9]+/gi, '_')}`],
  };
}

function profileWithAssets(): BrandSignalProfile {
  const profile = deriveBrandSignalProfile(
    {
      brandId: 'brand_insturix',
      userId: 'user_insturix',
      name: 'Insturix',
      voice: {
        voiceLock: 'Precise, warm, proof-led product voice.',
        nicheMap: 'creative operators',
        killList: ['generic dashboard'],
        hookArchetypes: ['missed future'],
        structuralHabits: ['open with product truth'],
      },
      visual: {
        industry: 'creative software',
        colors: ['#0b0b0f', '#31d5ff', '#f7f7f2'],
        visualStyle: 'minimal cinematic product interface with clean data density',
        typography: 'Inter sans',
      },
      learning: { banditProjectCount: 0 },
    },
    { generatedAt: '2026-07-04T00:00:00.000Z' },
  );

  makeActionable(profile.identity.brandName);
  makeActionable(profile.palette.primary);
  makeActionable(profile.palette.accent);
  makeActionable(profile.typography.category);
  makeActionable(profile.visual.dataVizAffinity);
  makeActionable(profile.motion.motionEnergy);
  makeActionable(profile.voice.warmth);
  makeActionable(profile.voice.killList);
  profile.assets = {
    productImages: arraySignal(['https://brand.example/insturix-product.png'], 'assets.productImages'),
    socialPreviewImages: arraySignal(['https://brand.example/insturix-site.png'], 'assets.socialPreviewImages'),
  };
  return profile;
}

function visualIdentityWithUploadedLogo(): BrandVaultVisualIdentitySummary {
  return {
    colors: [
      {
        id: 'color_primary',
        label: 'Primary',
        value: '#31d5ff',
        role: 'primary',
        confidence: 0.9,
        signalPath: 'palette.primary',
        unsafeOnDark: false,
        unsafeOnLight: false,
      },
    ],
    fonts: [
      {
        id: 'font_inter',
        family: 'Inter',
        cssFontFamily: 'Inter, sans-serif',
        role: 'body',
        sourceKind: 'manual_or_local_family',
        previewStatus: 'family_name_only',
        sampleText: 'Insturix',
        confidence: 0.82,
        signalPath: 'typography.raw',
      },
    ],
    logos: [
      {
        id: 'logo_uploaded',
        kind: 'logo',
        label: 'Uploaded Insturix Logo',
        url: 'https://brand.example/insturix-logo.svg',
        confidence: 0.96,
        signalPath: 'assets.logoCandidates',
        sourceType: 'uploaded_asset',
        evidenceOrigin: 'user_supplied',
      },
    ],
    images: [
      {
        id: 'uploaded_product_ref',
        kind: 'product',
        label: 'Uploaded product reference',
        url: 'https://brand.example/uploaded-product-reference.png',
        confidence: 0.9,
        sourceType: 'uploaded_asset',
        assetRole: 'product_ui',
        evidenceOrigin: 'user_supplied',
      },
    ],
  };
}

function legacyBrand(): UnifiedBrand {
  return {
    brandId: 'brand_insturix',
    userId: 'user_insturix',
    name: 'Insturix',
    voice: {
      voiceLock: 'Precise, warm, proof-led product voice.',
      nicheMap: 'creative operators',
      killList: ['generic dashboard'],
      hookArchetypes: ['missed future'],
      structuralHabits: ['open with product truth'],
    },
    visual: {
      industry: 'creative software',
      colors: ['#0b0b0f', '#31d5ff', '#f7f7f2'],
      visualStyle: 'minimal cinematic product interface with clean data density',
      typography: 'Inter sans',
    },
    learning: { banditProjectCount: 0 },
  };
}

describe('BrandProductionEvidencePack', () => {
  it('preserves Brand Vault and uploaded assets as typed production evidence', () => {
    const profile = profileWithAssets();
    const pack = buildBrandProductionEvidencePack({
      brandId: 'brand_insturix',
      generatedAt: '2026-07-04T12:00:00.000Z',
      resolution: {
        brand: legacyBrand(),
        acceptedProfile: profile,
        acceptedRecord: { id: 'record_insturix', status: 'accepted', profile } as any,
        acceptedReviewPayload: { visualIdentity: visualIdentityWithUploadedLogo() } as any,
        source: 'brand_vault',
      },
    });

    expect(pack.schemaVersion).toBe('brand-production-evidence-pack/v1');
    expect(pack.brand).toMatchObject({
      brandId: 'brand_insturix',
      brandName: 'Insturix',
      source: 'brand_vault',
      acceptedProfileId: 'record_insturix',
    });
    expect(pack.assets.logos).toEqual([
      expect.objectContaining({
        role: 'logo',
        url: 'https://brand.example/insturix-logo.svg',
        provenance: 'uploaded',
        signalPath: 'assets.logoCandidates',
      }),
    ]);
    expect(pack.assets.productEvidence.map((asset) => [asset.role, asset.url, asset.provenance])).toEqual([
      ['product', 'https://brand.example/insturix-product.png', 'brand-vault'],
      ['website-screenshot', 'https://brand.example/insturix-site.png', 'website-screenshot'],
      ['product', 'https://brand.example/uploaded-product-reference.png', 'uploaded'],
    ]);
    expect(pack.coverage).toMatchObject({
      acceptedProfile: true,
      canUseBrandIdentity: true,
      canShowLogo: true,
      canShowOwnedProduct: true,
      syntheticModeRequired: false,
    });
    expect(pack.coverage.missingInputs).toEqual([]);
    expect(pack.motionInputs.primaryColor).toBeTruthy();
    expect(pack.creativeSignalDefaults?.signals.visual_dependency).toBeTruthy();
  });

  it('does not treat team, abstract, or creative reference uploads as owned product proof', () => {
    const profile = profileWithAssets();
    delete profile.assets;
    const baseVisualIdentity = visualIdentityWithUploadedLogo();
    const pack = buildBrandProductionEvidencePack({
      brandId: 'brand_insturix',
      generatedAt: '2026-07-04T12:00:00.000Z',
      resolution: {
        brand: legacyBrand(),
        acceptedProfile: profile,
        acceptedRecord: { id: 'record_insturix', status: 'accepted', profile } as any,
        acceptedReviewPayload: {
          visualIdentity: {
            ...baseVisualIdentity,
            images: [
              {
                id: 'team_photo',
                kind: 'uploaded_asset',
                label: 'Insturix team photo',
                url: 'https://brand.example/team-photo.png',
                confidence: 0.93,
                sourceType: 'uploaded_asset',
                assetRole: 'team',
                evidenceOrigin: 'user_supplied',
              },
              {
                id: 'workflow_abstract',
                kind: 'uploaded_asset',
                label: 'Fragmented workflow environment',
                url: 'https://brand.example/fragmented-workflow.png',
                confidence: 0.91,
                sourceType: 'uploaded_asset',
                assetRole: 'abstract_reference',
                evidenceOrigin: 'user_supplied',
              },
              {
                id: 'moodboard',
                kind: 'uploaded_asset',
                label: 'Moodboard reference',
                url: 'https://brand.example/moodboard.png',
                confidence: 0.9,
                sourceType: 'uploaded_asset',
                assetRole: 'creative_reference',
                evidenceOrigin: 'user_supplied',
              },
            ],
          },
        } as any,
        source: 'brand_vault',
      },
    });

    expect(pack.assets.productEvidence).toEqual([]);
    expect(pack.assets.allVisualEvidence.map((asset) => [asset.role, asset.url])).toEqual([
      ['logo', 'https://brand.example/insturix-logo.svg'],
      ['uploaded-reference', 'https://brand.example/team-photo.png'],
      ['uploaded-reference', 'https://brand.example/fragmented-workflow.png'],
      ['uploaded-reference', 'https://brand.example/moodboard.png'],
    ]);
    expect(pack.coverage.canShowOwnedProduct).toBe(false);
    expect(pack.coverage.syntheticModeRequired).toBe(true);
    expect(pack.coverage.missingInputs).toContain('product_evidence');
    expect(evaluateBrandSubjectEvidence({
      name: 'Insturix Platform',
      category: 'product',
      visualDescription: 'A real Insturix platform interface.',
    }, pack)).toMatchObject({
      required: true,
      status: 'missing',
      role: 'product',
    });
  });
  it('fails closed when no accepted Brand Vault profile is available', () => {
    const pack = buildBrandProductionEvidencePack({
      brandId: 'brand_insturix',
      generatedAt: '2026-07-04T12:00:00.000Z',
      resolution: {
        brand: null,
        acceptedProfile: null,
        acceptedRecord: null,
        acceptedReviewPayload: null,
        source: 'none',
      },
    });

    expect(pack.coverage.acceptedProfile).toBe(false);
    expect(pack.coverage.canUseBrandIdentity).toBe(false);
    expect(pack.coverage.canShowLogo).toBe(false);
    expect(pack.coverage.canShowOwnedProduct).toBe(false);
    expect(pack.coverage.syntheticModeRequired).toBe(true);
    expect(pack.coverage.missingInputs).toEqual([
      'accepted_profile',
      'brand_name',
      'brand_identity',
      'logo',
      'product_evidence',
    ]);
    expect(pack.degradations.filter((item) => item.severity === 'blocker').map((item) => item.code)).toEqual([
      'accepted_profile',
      'brand_name',
    ]);
  });

  it('evaluates brand-owned subjects against logo versus product evidence duties', () => {
    const profile = profileWithAssets();
    const pack = buildBrandProductionEvidencePack({
      brandId: 'brand_insturix',
      resolution: {
        brand: legacyBrand(),
        acceptedProfile: profile,
        acceptedRecord: null,
        acceptedReviewPayload: { visualIdentity: visualIdentityWithUploadedLogo() } as any,
        source: 'brand_vault',
      },
    });

    expect(evaluateBrandSubjectEvidence({
      name: 'Insturix Logo',
      category: 'object',
      visualDescription: 'The Insturix logo appears on a large screen.',
    }, pack)).toMatchObject({
      required: true,
      status: 'resolved',
      role: 'logo',
    });

    expect(evaluateBrandSubjectEvidence({
      name: 'Insturix Platform',
      category: 'product',
      visualDescription: 'A real Insturix platform interface.',
    }, pack)).toMatchObject({
      required: true,
      status: 'resolved',
      role: 'product',
    });

    expect(evaluateBrandSubjectEvidence({
      name: 'Fragmented Workflow Environment',
      category: 'environment',
      visualDescription: 'A chaotic abstract workflow visual.',
    }, pack)).toMatchObject({
      required: false,
      status: 'not-required',
      role: 'none',
    });
  });

  it('formats a prompt block that exposes provenance and hard generation rules', () => {
    const profile = profileWithAssets();
    const pack = buildBrandProductionEvidencePack({
      brandId: 'brand_insturix',
      resolution: {
        brand: legacyBrand(),
        acceptedProfile: profile,
        acceptedRecord: null,
        acceptedReviewPayload: { visualIdentity: visualIdentityWithUploadedLogo() } as any,
        source: 'brand_vault',
      },
    });

    const block = formatBrandProductionEvidencePromptBlock(pack);

    expect(block).toContain('<brand_production_evidence_pack>');
    expect(block).toContain('Uploaded Insturix Logo <https://brand.example/insturix-logo.svg> (uploaded via assets.logoCandidates)');
    expect(block).toContain('Brand-owned product, platform, UI, website, and logo subjects require verified evidence');
    expect(block).not.toContain('generated fake');
  });
});
