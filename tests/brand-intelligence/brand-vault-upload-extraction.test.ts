import { describe, expect, it } from 'vitest';
import {
  createBrandVaultUploadSourceFromMetadata,
  extractHexColorsFromUploadText,
  inferBrandVaultSourceKind,
  inferBrandVaultUploadedAssetRole,
} from '../../lib/frontend/services/brand-vault-upload-extraction';

describe('Brand Vault upload extraction helpers', () => {
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
});
