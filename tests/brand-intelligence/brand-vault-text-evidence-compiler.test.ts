import { describe, expect, it } from 'vitest';
import type { BrandVaultTextEvidenceCompilerInput } from '../../lib/shared/brand-vault-draft-orchestrator';
import {
  createBrandVaultGeminiTextEvidenceCompiler,
  createBrandVaultTextEvidenceCompilerFromEnvironment,
} from '../../lib/shared/brand-vault-text-evidence-compiler';

const NOW = '2026-06-17T09:00:00.000Z';

const COMPILER_INPUT: BrandVaultTextEvidenceCompilerInput = {
  jobId: 'job_text_compiler_provider',
  input: {
    userId: 'user_signal',
    brandId: 'brand_signal',
    websiteUrl: 'https://signal.example/',
    companyName: 'Signal House',
  },
  website: {
    normalizedUrl: 'https://signal.example/',
    html: `
      <html>
        <head><title>Signal House</title><script>window.noise = true;</script></head>
        <body>
          <h1>Video systems for founder-led creative teams</h1>
          <p>Book a demo to see trusted production workflows in action.</p>
        </body>
      </html>
    `,
    fetchedAt: NOW,
  },
  crawlSnapshots: [
    {
      normalizedUrl: 'https://signal.example/customers',
      html: '<html><body><h1>Trusted by 120 agency operators</h1><p>Case studies show faster content delivery.</p></body></html>',
      fetchedAt: NOW,
    },
  ],
  sourceEvidence: [
    {
      kind: 'social_post',
      platform: 'instagram',
      url: 'https://www.instagram.com/p/founder-led/',
      name: 'Instagram media founder-led',
      note: 'Fetched from connected UploaderX Instagram account for Brand Vault draft review.',
      text: 'Content production is broken. One platform. Not ten.',
      media: {
        ocrText: 'Scale production without brand drift.',
      },
      metrics: {
        engagementCount: 480,
      },
      evidenceOrigin: 'public_fallback',
    },
  ],
  existingCandidates: [],
  observedAt: NOW,
};

describe('Brand Vault text evidence compiler', () => {
  it('stays disabled unless the explicit env gate and Gemini key are present', () => {
    expect(createBrandVaultTextEvidenceCompilerFromEnvironment({
      env: testEnv({
        BRAND_VAULT_TEXT_COMPILER_ENABLED: 'false',
        GEMINI_API_KEY: 'gemini_key',
      }),
    })).toBeUndefined();
    expect(createBrandVaultTextEvidenceCompilerFromEnvironment({
      env: testEnv({
        BRAND_VAULT_TEXT_COMPILER_ENABLED: 'true',
      }),
    })).toBeUndefined();
    expect(createBrandVaultTextEvidenceCompilerFromEnvironment({
      env: testEnv({
        BRAND_VAULT_TEXT_COMPILER_ENABLED: 'true',
        GEMINI_API_KEY: 'gemini_key',
      }),
      fetchFn: async () => jsonResponse({ candidates: [] }),
    })).toEqual(expect.any(Function));
  });

  it('normalizes Gemini JSON into capped inferred review candidates', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const compiler = createBrandVaultGeminiTextEvidenceCompiler({
      apiKey: 'gemini_key',
      model: 'gemini-test',
      fetchFn: async (url, init) => {
        calls.push({
          url,
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });
        return jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      candidates: [
                        {
                          signalPath: 'identity.audience',
                          normalizedValue: ['founder-led creative teams', 'businesses'],
                          excerpt: 'Video systems for founder-led creative teams.',
                          sourceField: 'website.root',
                          sourceUrl: 'https://signal.example/',
                          confidence: 0.91,
                        },
                        {
                          signalPath: 'identity.proofStyle',
                          normalizedValue: 'metrics',
                          excerpt: 'Trusted by 120 agency operators.',
                          sourceField: 'crawl.1',
                          sourceUrl: 'https://signal.example/customers',
                          confidence: 0.62,
                        },
                        {
                          signalPath: 'voice.ctaDirectness',
                          normalizedValue: 1.4,
                          excerpt: 'Book a demo to see trusted production workflows in action.',
                          sourceField: 'website.root',
                          confidence: 0.6,
                        },
                        {
                          signalPath: 'motion.motionEnergy',
                          normalizedValue: 0.9,
                          excerpt: 'unsupported path',
                          sourceField: 'website.root',
                          confidence: 0.9,
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        });
      },
    });

    const result = await compiler(COMPILER_INPUT);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/v1beta/models/gemini-test:generateContent?key=gemini_key');
    expect(JSON.stringify(calls[0].body)).toContain('founder-led creative teams');
    expect(JSON.stringify(calls[0].body)).toContain('sourceEvidence.0.social_post');
    expect(JSON.stringify(calls[0].body)).toContain('Scale production without brand drift');
    expect(JSON.stringify(calls[0].body)).not.toContain('Instagram media founder-led');
    expect(JSON.stringify(calls[0].body)).not.toContain('Fetched from connected UploaderX Instagram account');
    expect(result.warnings).toContain(
      'Brand Vault text evidence compiler produced inferred review candidates from website and source evidence.',
    );
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0]).toMatchObject({
      brandId: 'brand_signal',
      jobId: 'job_text_compiler_provider',
      sourceType: 'website',
      sourceField: 'website.root',
      signalPath: 'identity.audience',
      normalizedValue: ['founder-led creative teams'],
      confidence: 0.68,
      authorityClass: 'inferred',
      observedAt: NOW,
      extractorId: 'brand-vault-text-evidence-compiler.gemini',
    });
    expect(result.candidates[1]).toMatchObject({
      sourceType: 'website',
      signalPath: 'identity.proofStyle',
      normalizedValue: 'metrics',
      confidence: 0.62,
    });
    expect(result.candidates[2]).toMatchObject({
      signalPath: 'voice.ctaDirectness',
      normalizedValue: 1,
      confidence: 0.6,
    });
    expect(result.candidates.some((candidate) => candidate.signalPath === 'motion.motionEnergy')).toBe(false);
  });

  it('repairs fenced Gemini JSON with trailing commas before applying signal gates', async () => {
    const compiler = createBrandVaultGeminiTextEvidenceCompiler({
      apiKey: 'gemini_key',
      fetchFn: async () => jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `Here is the JSON:
\`\`\`json
{
  "candidates": [
    {
      "signalPath": "voice.recurringPhrases",
      "normalizedValue": ["Content production is broken", "One platform. Not ten."],
      "excerpt": "Content production is broken. One platform. Not ten.",
      "sourceField": "sourceEvidence.0.social_post",
      "sourceUrl": "https://www.instagram.com/p/founder-led/",
      "confidence": 0.66,
    },
  ],
}
\`\`\``,
                },
              ],
            },
          },
        ],
      }),
    });

    await expect(compiler(COMPILER_INPUT)).resolves.toMatchObject({
      candidates: [
        {
          sourceType: 'social_post',
          sourceField: 'sourceEvidence.0.social_post',
          sourceUrl: 'https://www.instagram.com/p/founder-led/',
          signalPath: 'voice.recurringPhrases',
          normalizedValue: ['Content production is broken', 'One platform. Not ten.'],
          confidence: 0.66,
        },
      ],
      warnings: ['Brand Vault text evidence compiler produced inferred review candidates from website and source evidence.'],
    });
  });

  it('returns warnings instead of candidates when Gemini is unavailable or malformed', async () => {
    const unavailableCompiler = createBrandVaultGeminiTextEvidenceCompiler({
      apiKey: 'gemini_key',
      fetchFn: async () => new Response('rate limited', { status: 429 }),
    });
    await expect(unavailableCompiler(COMPILER_INPUT)).resolves.toEqual({
      candidates: [],
      warnings: ['Brand Vault text evidence compiler skipped: Gemini returned HTTP 429.'],
    });

    const malformedCompiler = createBrandVaultGeminiTextEvidenceCompiler({
      apiKey: 'gemini_key',
      fetchFn: async () => jsonResponse({
        candidates: [{ content: { parts: [{ text: 'not json' }] } }],
      }),
    });
    await expect(malformedCompiler(COMPILER_INPUT)).resolves.toEqual({
      candidates: [],
      warnings: ['Brand Vault text evidence compiler skipped: Gemini returned invalid JSON.'],
    });
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function testEnv(values: Record<string, string>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    ...values,
  };
}
