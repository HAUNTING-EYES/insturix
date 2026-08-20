import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  compositeClickatronBrandLogoOverlay,
  loadAcceptedBrandVaultLogo,
  verifyAcceptedBrandVaultLogoAvailable,
  type BrandVaultLogoObjectStore,
} from '@/lib/clickatron/brand-logo-overlay';
import {
  selectClickatronAcceptedLogoOverlayEvidence,
  selectClickatronGenerationBrandEvidence,
  type ClickatronAcceptedLogoOverlayEvidence,
} from '@/lib/clickatron/brand-reference-images';
import { buildClickatronGenerationPrompt } from '@/lib/clickatron/brand-prompt-context';

const repoRoot = process.cwd();
const storageEnv = {
  R2_ACCOUNT_ID: 'account',
  R2_ACCESS_KEY_ID: 'access',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET_NAME: 'brand-vault',
};

function acceptedLogoEvidence(overrides: Partial<ClickatronAcceptedLogoOverlayEvidence> = {}): ClickatronAcceptedLogoOverlayEvidence {
  return {
    url: 'https://cdn.example.test/brandvault_logo.png',
    assetRole: 'logo',
    source: 'brand-vault-logo',
    isStoredAsset: true,
    assetId: 'accepted_logo_1',
    storageKey: 'brandvault_brand_1_logo.png',
    storageProvider: 'cloudflare_r2',
    storageContentType: 'image/png',
    ...overrides,
  };
}

function storeFor(body: Buffer, overrides: Partial<BrandVaultLogoObjectStore> = {}): BrandVaultLogoObjectStore {
  return {
    head: async () => ({ contentType: 'image/png', contentLength: body.length }),
    get: async () => ({ body, contentType: 'image/png', contentLength: body.length }),
    ...overrides,
  };
}

describe('Clickatron accepted Brand Vault logo overlay', () => {
  it('selects only a stored accepted visual-identity logo, never a candidate URL', () => {
    const stored = acceptedLogoEvidence();
    const resolution = {
      intent: { requiresProduct: false, requiresLogo: true },
      needsUserInput: false,
      evidence: [
        {
          url: 'https://candidate.example.test/logo.svg',
          assetRole: 'logo' as const,
          source: 'brand-vault-logo-candidate' as const,
        },
        stored,
      ],
    };

    expect(selectClickatronAcceptedLogoOverlayEvidence(resolution)).toEqual(stored);
    expect(
      selectClickatronGenerationBrandEvidence(resolution, {
        hasParentImage: false,
        userReferenceImageCount: 1,
        excludeLogoReferences: true,
      }),
    ).toEqual([]);
    expect(selectClickatronAcceptedLogoOverlayEvidence({ ...resolution, evidence: [resolution.evidence[0]] })).toBeUndefined();
  });

  it('preflights and reads the exact stored R2 object without fetching a public URL', async () => {
    const logo = await sharp({ create: { width: 80, height: 40, channels: 4, background: { r: 220, g: 10, b: 10, alpha: 1 } } })
      .png()
      .toBuffer();
    const calls: Array<{ kind: string; bucket: string; key: string }> = [];
    const store = storeFor(logo, {
      head: async ({ bucket, key }) => {
        calls.push({ kind: 'head', bucket, key });
        return { contentType: 'image/png', contentLength: logo.length };
      },
      get: async ({ bucket, key }) => {
        calls.push({ kind: 'get', bucket, key });
        return { body: logo, contentType: 'image/png', contentLength: logo.length };
      },
    });
    const evidence = acceptedLogoEvidence();

    await verifyAcceptedBrandVaultLogoAvailable(evidence, { store, env: storageEnv });
    const loaded = await loadAcceptedBrandVaultLogo(evidence, { store, env: storageEnv });

    expect(calls).toEqual([
      { kind: 'head', bucket: 'brand-vault', key: evidence.storageKey },
      { kind: 'get', bucket: 'brand-vault', key: evidence.storageKey },
    ]);
    expect(loaded.buffer).toEqual(logo);
    expect(loaded.contentType).toBe('image/png');
    expect(loaded.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails clearly when the accepted R2 object is no longer present or is not an image', async () => {
    const evidence = acceptedLogoEvidence();
    const missingStore = storeFor(Buffer.from('unused'), {
      head: async () => {
        const error = Object.assign(new Error('not found'), { $metadata: { httpStatusCode: 404 } });
        throw error;
      },
    });
    await expect(verifyAcceptedBrandVaultLogoAvailable(evidence, { store: missingStore, env: storageEnv }))
      .rejects.toMatchObject({
        code: 'BRAND_LOGO_OVERLAY_ASSET_UNAVAILABLE',
      });

    await expect(loadAcceptedBrandVaultLogo(evidence, {
      store: storeFor(Buffer.from('not an image'), {
        get: async () => ({ body: Buffer.from('not an image'), contentType: 'text/plain', contentLength: 12 }),
      }),
      env: storageEnv,
    })).rejects.toMatchObject({
      code: 'BRAND_LOGO_OVERLAY_ASSET_INVALID',
    });
  });

  it('composites the exact accepted mark at the user-reviewed placement and records final geometry', async () => {
    const [canvas, logoBuffer] = await Promise.all([
      sharp({ create: { width: 1_000, height: 600, channels: 3, background: { r: 14, g: 24, b: 38 } } }).jpeg().toBuffer(),
      sharp({ create: { width: 80, height: 40, channels: 4, background: { r: 230, g: 16, b: 28, alpha: 1 } } }).png().toBuffer(),
    ]);
    const evidence = acceptedLogoEvidence();
    const result = await compositeClickatronBrandLogoOverlay({
      imageBuffer: canvas,
      logo: {
        buffer: logoBuffer,
        contentType: 'image/png',
        byteLength: logoBuffer.length,
        sha256: 'f'.repeat(64),
      },
      evidence,
      overlay: {
        version: 1,
        treatment: 'approved_logo',
        placement: 'bottom_right',
        scale: 'small',
        authority: 'user_review',
      },
    });

    expect(result.contentType).toBe('image/jpeg');
    expect(result.receipt).toMatchObject({
      authority: 'user_review',
      treatment: 'approved_logo',
      placement: 'bottom_right',
      scale: 'small',
      asset: { assetId: 'accepted_logo_1', sha256: 'f'.repeat(64) },
      geometry: { canvasWidth: 1_000, canvasHeight: 600, marginPx: 24, left: 904, top: 540, logoWidth: 72, logoHeight: 36 },
    });

    const composed = await sharp(result.imageBuffer).raw().toBuffer({ resolveWithObject: true });
    const { left, top } = result.receipt.geometry;
    const pixelOffset = ((top + 8) * composed.info.width + (left + 8)) * composed.info.channels;
    expect(composed.data[pixelOffset]).toBeGreaterThan(150);
    expect(composed.data[pixelOffset + 1]).toBeLessThan(100);
    expect(composed.data[pixelOffset + 2]).toBeLessThan(100);
  });

  it('keeps the selected logo safe area in the compiled image prompt', () => {
    const prompt = buildClickatronGenerationPrompt({
      prompt: 'Editorial abstract composition with quiet negative space.',
      modelId: 'fal-ai/imagen4/preview',
      metadata: {
        clickatronHandoff: {
          logoOverlay: {
            version: 1,
            treatment: 'approved_logo',
            placement: 'top_left',
            scale: 'medium',
            authority: 'user_review',
          },
        },
      },
    });

    expect(prompt).toContain('Leave the top left medium safe area clear.');
    expect(prompt).toContain('the exact accepted Brand Vault logo is composited after raster generation');
  });

  it('keeps the verified overlay before billing and before Fal execution', () => {
    const sessionRoute = readFileSync(join(repoRoot, 'app/api/services/clickatron/session/route.ts'), 'utf8');
    const workerRoute = readFileSync(join(repoRoot, 'app/api/internal/workers/clickatron/variation/route.ts'), 'utf8');

    expect(sessionRoute.indexOf('await verifyAcceptedBrandVaultLogoAvailable(acceptedOverlayEvidence)')).toBeLessThan(
      sessionRoute.indexOf('checkCredits(userId'),
    );
    expect(workerRoute.indexOf('acceptedLogoOverlayAsset = await loadAcceptedBrandVaultLogo(acceptedLogoOverlayEvidence)')).toBeLessThan(
      workerRoute.indexOf('fal.subscribe('),
    );
    expect(workerRoute).toContain('compositeClickatronBrandLogoOverlay');
    expect(workerRoute).toContain('generationParams.brandLogoOverlay = composed.receipt');
  });
});
