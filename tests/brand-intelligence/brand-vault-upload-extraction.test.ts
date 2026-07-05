import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBrandVaultUploadSourceFromMetadata,
  extractBrandVaultUploadEvidence,
  extractHexColorsFromUploadText,
  inferBrandVaultSourceKind,
  inferBrandVaultUploadedAssetRole,
} from '../../lib/frontend/services/brand-vault-upload-extraction';
import {
  normalizeBrandVaultUploadContentType,
  shouldStoreBrandVaultUploadAsset,
} from '../../lib/shared/brand-vault-upload-storage';

describe('Brand Vault upload extraction helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes and deduplicates hex color evidence from uploaded text', () => {
    expect(extractHexColorsFromUploadText('Palette: #ABC, #aabbcc, #102033, #nothex')).toEqual([
      '#aabbcc',
      '#102033',
    ]);
  });

  it('creates guideline evidence with text and color metadata for brand books', () => {
    const source = createBrandVaultUploadSourceFromMetadata({
      name: 'Signal brand-book.md',
      mimeType: 'text/markdown',
      sizeBytes: 2048,
      text: 'Tone: crisp and practical.\nPalette: #102033 #fc0',
      dominantColors: ['#102033'],
    });

    expect(source).toMatchObject({
      kind: 'uploaded_guideline',
      name: 'Signal brand-book.md',
      mimeType: 'text/markdown',
      sizeBytes: 2048,
      text: 'Tone: crisp and practical.\nPalette: #102033 #fc0',
      dominantColors: ['#102033', '#ffcc00'],
      assetRole: 'brand_book',
    });
    expect(source.note).toBe('Uploaded brand guideline; text extracted; 2 colors observed.');
  });

  it('classifies logo imagery as uploaded brand assets', () => {
    expect(inferBrandVaultUploadedAssetRole('primary-logo.png', 'image/png')).toBe('logo');
    expect(inferBrandVaultSourceKind('primary-logo.png', 'image/png')).toBe('uploaded_asset');

    const source = createBrandVaultUploadSourceFromMetadata({
      name: 'primary-logo.png',
      mimeType: 'image/png',
      sizeBytes: 8096,
      dominantColors: ['#111', '#ffcc33'],
    });

    expect(source).toMatchObject({
      kind: 'uploaded_asset',
      assetRole: 'logo',
      dominantColors: ['#111111', '#ffcc33'],
    });
  });

  it('classifies uploaded visual evidence by role before server extraction returns', () => {
    expect(inferBrandVaultUploadedAssetRole('insturix-dashboard-screenshot.png', 'image/png')).toBe('product_ui');
    expect(inferBrandVaultUploadedAssetRole('homepage-screenshot.png', 'image/png')).toBe('website_screenshot');
    expect(inferBrandVaultUploadedAssetRole('founder-team-photo.jpg', 'image/jpeg')).toBe('team');
    expect(inferBrandVaultUploadedAssetRole('fragmented-workflow-background.webp', 'image/webp')).toBe('abstract_reference');

    expect(createBrandVaultUploadSourceFromMetadata({
      name: 'insturix-dashboard-screenshot.png',
      mimeType: 'image/png',
      sizeBytes: 42_000,
    })).toMatchObject({
      kind: 'uploaded_asset',
      assetRole: 'product_ui',
    });
  });

  it('stages binary guideline files without pretending text was extracted', () => {
    const source = createBrandVaultUploadSourceFromMetadata({
      name: 'approved-guidelines.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 512_000,
    });

    expect(source.kind).toBe('uploaded_guideline');
    expect(source.assetRole).toBe('brand_book');
    expect(source.text).toBeUndefined();
    expect(source.dominantColors).toBeUndefined();
    expect(source.note).toBe('Uploaded brand guideline; metadata staged for review.');
  });

  it('round-trips uploaded logo images through server extraction so stored urls survive staging', async () => {
    const storedUrl = 'https://cdn.example.com/brandvault-uploads/user_1/logo/primary_logo.svg';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      source: {
        kind: 'uploaded_asset',
        name: 'primary-logo.svg',
        url: storedUrl,
        note: 'Uploaded brand asset; text extracted; 1 color observed.',
        mimeType: 'image/svg+xml',
        sizeBytes: 74,
        text: '<svg><path fill="#102033"/></svg>',
        dominantColors: ['#102033'],
        assetRole: 'logo',
      },
      warnings: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['<svg><path fill="#102033"/></svg>'], 'primary-logo.svg', { type: 'image/svg+xml' });
    const result = await extractBrandVaultUploadEvidence(file);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.source).toMatchObject({
      kind: 'uploaded_asset',
      assetRole: 'logo',
      url: storedUrl,
      dominantColors: ['#102033'],
    });
  });

  it('only stores uploaded visual assets, not uploaded brand books', () => {
    expect(shouldStoreBrandVaultUploadAsset({
      kind: 'uploaded_asset',
      assetRole: 'logo',
      name: 'logo.png',
      mimeType: 'image/png',
    })).toBe(true);
    expect(normalizeBrandVaultUploadContentType(undefined, 'logo.svg')).toBe('image/svg+xml');
    expect(shouldStoreBrandVaultUploadAsset({
      kind: 'uploaded_guideline',
      assetRole: 'brand_book',
      name: 'brand-book.pdf',
      mimeType: 'application/pdf',
    })).toBe(false);
  });
});
