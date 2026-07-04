import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function sliceHelper(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('Brand Vault provider cost telemetry contract', () => {
  it('records Apify public social fallback actor attempts as Brand Vault scan spend', () => {
    const source = readRepoFile('lib/shared/brand-vault-connected-social-ingestion.ts');

    expect(source).toContain('recordBrandVaultApifyCost({');
    expect(source).toContain("service: 'brand_vault'");
    expect(source).toContain("action: 'brand_scan'");
    expect(source).toContain("route: 'lib/shared/brand-vault-connected-social-ingestion'");
    expect(source).toContain("provider: 'apify'");
    expect(source).toContain('model: input.actorId');
    expect(source).toContain("operation: 'actor_run'");
    expect(source).toContain('requestBytes');
    expect(source).toContain('responseBytes');
    expect(source).toContain('acceptedItemCount');
    expect(source).toContain('rejectedItemCount');
  });

  it('records Gemini OCR attempts with image bytes and usage metadata when available', () => {
    const source = readRepoFile('lib/shared/brand-vault-social-ocr.ts');

    expect(source).toContain('recordBrandVaultGeminiOcrCost({');
    expect(source).toContain("route: 'lib/shared/brand-vault-social-ocr'");
    expect(source).toContain("provider: 'gemini'");
    expect(source).toContain("operation: 'image_ocr'");
    expect(source).toContain('imageCount: 1');
    expect(source).toContain('bytesIn: input.imageBytes');
    expect(source).toContain('usage: readGeminiUsage(result)');
    expect(source).toContain("sourceKind: input.sourceKind ?? 'social'");
  });

  it('records committed-thumbnail Gemini vision attempts as Brand Vault scan spend', () => {
    const source = readRepoFile('lib/shared/brand-vault-thumbnail-visual.ts');

    expect(source).toContain('recordBrandVaultThumbnailVisionCost({');
    expect(source).toContain("route: 'lib/shared/brand-vault-thumbnail-visual'");
    expect(source).toContain("provider: 'gemini'");
    expect(source).toContain("operation: 'image_vision'");
    expect(source).toContain('imageCount: 1');
    expect(source).toContain('bytesIn: input.imageBytes');
    expect(source).toContain('usage: readGeminiUsage(result)');
    expect(source).toContain("sourceKind: 'committed_thumbnail'");
    expect(source).toContain('parseableSignals: Boolean(signals)');
  });

  it('records endpoint, Modal, local Playwright, and Firecrawl browser-render attempts', () => {
    const source = readRepoFile('lib/shared/brand-vault-browser-fallback.ts');

    expect(source).toContain('recordBrandVaultBrowserRenderCost({');
    expect(source).toContain("route: 'lib/shared/brand-vault-browser-fallback'");
    expect(source).toContain("operation: 'browser_render'");
    expect(source).toContain("'brand-vault-render-endpoint'");
    expect(source).toContain("'modal'");
    expect(source).toContain("'local-playwright'");
    expect(source).toContain("'firecrawl'");
    expect(source).toContain('const providerName = endpointRenderProvider(env, endpoint);');
    expect(source).toContain("providerName: 'local-playwright'");
    expect(source).toContain("providerName: 'firecrawl'");
    expect(source).toContain('hasRenderedPrimitives');
  });

  it('does not record fake provider spend when Brand Vault providers are disabled or missing credentials', () => {
    const social = readRepoFile('lib/shared/brand-vault-connected-social-ingestion.ts');
    const browser = readRepoFile('lib/shared/brand-vault-browser-fallback.ts');
    const ocr = readRepoFile('lib/shared/brand-vault-social-ocr.ts');
    const thumbnailVision = readRepoFile('lib/shared/brand-vault-thumbnail-visual.ts');

    expect(social).toContain("if (!apiKey)");
    expect(social).toContain("if (!apifyActorId)");
    expect(browser).toContain("if (provider === 'off') return undefined;");
    expect(browser).toContain('if (!firecrawlApiKey) return undefined;');
    expect(ocr).toContain('if (!enabled || !apiKey) return null;');
    expect(thumbnailVision).toContain('if (!apiKey)');
  });

  it('keeps Brand Vault provider-cost metadata free of content, URLs, credentials, and payload bodies', () => {
    const social = readRepoFile('lib/shared/brand-vault-connected-social-ingestion.ts');
    const ocr = readRepoFile('lib/shared/brand-vault-social-ocr.ts');
    const thumbnailVision = readRepoFile('lib/shared/brand-vault-thumbnail-visual.ts');
    const browser = readRepoFile('lib/shared/brand-vault-browser-fallback.ts');
    const helpers = [
      sliceHelper(social, 'async function recordBrandVaultApifyCost', 'function byteLength'),
      sliceHelper(ocr, 'async function recordBrandVaultGeminiOcrCost', 'function readGeminiUsage'),
      sliceHelper(thumbnailVision, 'async function recordBrandVaultThumbnailVisionCost', 'function readGeminiUsage'),
      sliceHelper(browser, 'async function recordBrandVaultBrowserRenderCost', 'function endpointRenderProvider'),
    ].join('\n');

    expect(helpers).not.toContain('apiKey');
    expect(helpers).not.toContain('authorization');
    expect(helpers).not.toContain('token');
    expect(helpers).not.toContain('sourceUrl');
    expect(helpers).not.toContain('imageUrl');
    expect(helpers).not.toContain('imageBase64');
    expect(helpers).not.toContain('rawText');
    expect(helpers).not.toContain('text:');
    expect(helpers).not.toContain('html:');
    expect(helpers).not.toContain('normalizedUrl');
    expect(helpers).not.toContain('endpoint');
    expect(helpers).not.toContain('requestBody');
    expect(helpers).not.toContain('renderRequestBody');
    expect(helpers).not.toContain('firecrawlRequestBody');
    expect(helpers).not.toContain('payload');
    expect(helpers).not.toContain('body:');
  });

  it('documents the partial T6 Brand Vault telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-05: Brand Vault scan provider events are wired');
    expect(plan).toContain('Apify actor, Gemini OCR/vision, Modal/local Playwright, and Firecrawl pricing remain `pricing_to_be_seen`');
  });
});
