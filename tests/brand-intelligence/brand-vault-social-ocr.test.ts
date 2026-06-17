import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrandVaultGeminiSocialOcrProvider } from '../../lib/shared/brand-vault-social-ocr';

const generateContent = vi.fn();

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent,
    }),
  })),
}));

describe('Brand Vault social OCR provider', () => {
  beforeEach(() => {
    generateContent.mockReset();
  });

  it('is disabled unless explicitly enabled with an API key', () => {
    expect(createBrandVaultGeminiSocialOcrProvider({ env: {} })).toBeNull();
    expect(createBrandVaultGeminiSocialOcrProvider({ env: { BRAND_VAULT_SOCIAL_OCR_ENABLED: 'true' } })).toBeNull();
  });

  it('fetches image bytes and preserves fenced OCR text', async () => {
    generateContent.mockResolvedValueOnce({
      response: {
        text: () => '```text\nLIMITED BETA\nBook a demo\n```',
      },
    });
    const fetchedUrls: string[] = [];
    const provider = createBrandVaultGeminiSocialOcrProvider({
      apiKey: 'gemini_key',
      enabled: true,
      env: {},
      fetchFn: async (url) => {
        fetchedUrls.push(url);
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'content-length': '3',
            'content-type': 'image/png',
          },
        });
      },
    });

    await expect(provider?.readTextFromImage({ imageUrl: 'https://cdn.example.com/post.png' })).resolves.toEqual({
      text: 'LIMITED BETA\nBook a demo',
    });
    expect(fetchedUrls).toEqual(['https://cdn.example.com/post.png']);
    expect(generateContent).toHaveBeenCalledWith([
      expect.stringContaining('Extract only visible text'),
      { inlineData: { mimeType: 'image/png', data: 'AQID' } },
    ]);
  });

  it('warns without calling Gemini when the fetched asset is not an image', async () => {
    const provider = createBrandVaultGeminiSocialOcrProvider({
      apiKey: 'gemini_key',
      enabled: true,
      env: {},
      fetchFn: async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    });

    await expect(provider?.readTextFromImage({ imageUrl: 'https://cdn.example.com/post' })).resolves.toEqual({
      warning: 'Brand Vault skipped social OCR for https://cdn.example.com/post: response was not an image.',
    });
    expect(generateContent).not.toHaveBeenCalled();
  });
});
