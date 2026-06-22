import { describe, expect, it } from 'vitest';
import { extractBrandVaultUploadEvidenceFromBuffer } from '../../lib/shared/brand-vault-upload-parser';
import type { BrandVaultSocialOcrProvider } from '../../lib/shared/brand-vault-social-ocr';

function mockOcr(text?: string): BrandVaultSocialOcrProvider {
  return {
    async readTextFromImage(input) {
      // Uploads must come through as inline base64 tagged sourceKind 'upload'.
      expect(typeof input.imageBase64).toBe('string');
      expect(input.imageBase64?.length).toBeGreaterThan(0);
      expect(input.sourceKind).toBe('upload');
      return text ? { text } : {};
    },
  };
}

describe('Brand Vault upload image OCR', () => {
  it('runs OCR on an uploaded image and stores the extracted text', async () => {
    const result = await extractBrandVaultUploadEvidenceFromBuffer(
      { name: 'brand-guide.png', mimeType: 'image/png', buffer: Buffer.from('fake-png-bytes-for-ocr') },
      { ocrProvider: mockOcr('BRAND GUIDE\nPrimary #114B3A / Secondary #E8B4C4') },
    );
    expect(result.source.text).toContain('BRAND GUIDE');
    expect(result.source.text).toContain('#114B3A');
  });

  it('adds no text when the OCR provider is disabled (null)', async () => {
    const result = await extractBrandVaultUploadEvidenceFromBuffer(
      { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('fake') },
      { ocrProvider: null },
    );
    expect(result.source.text ?? '').not.toContain('BRAND');
  });

  it('does not OCR non-image uploads', async () => {
    let called = false;
    const provider: BrandVaultSocialOcrProvider = {
      async readTextFromImage() {
        called = true;
        return {};
      },
    };
    await extractBrandVaultUploadEvidenceFromBuffer(
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('plain text brand notes') },
      { ocrProvider: provider },
    );
    expect(called).toBe(false);
  });
});
