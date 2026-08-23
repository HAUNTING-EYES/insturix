import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  resolveStyleReferenceSourceV1,
  StyleReferenceSourceErrorV1,
} from '@/lib/editron/services/style-reference-source-v1';
import { REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1 } from '@/lib/editron/reference-video/reference-materialized-media-registration-v1';

describe('style reference source V1', () => {
  it('resolves an owned asset through the shared source and canonical owners', async () => {
    const resolveSource = vi.fn().mockResolvedValue({
      ok: true,
      source: {
        kind: 'asset', referenceId: 'asset-1', videoUrl: 'https://signed/source.mov',
        sourceLabel: 'source.mov', durationSec: 18,
      },
    });
    const canonicalize = vi.fn().mockResolvedValue(canonical('asset-canonical'));

    const result = await resolveStyleReferenceSourceV1(
      { userId: 'user-1', orgId: 'org-1', assetId: 'asset-1', sourceName: 'Campaign cut' },
      { resolveSource, canonicalize, assetResolver: resolver() },
    );

    expect(resolveSource).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', referenceAssetId: 'asset-1', referenceVideoUrl: undefined,
    }));
    expect(canonicalize).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', orgId: 'org-1', audioUsageMode: 'preview-waveform-only',
    }));
    expect(result).toMatchObject({
      referenceAssetId: 'asset-canonical',
      sourceName: 'Campaign cut',
      registration: { assetId: 'asset-canonical', contentType: 'video/quicktime' },
    });
  });

  it('resolves a project video overlay to its owned asset without trusting its URL', async () => {
    const resolveSource = vi.fn().mockResolvedValue({
      ok: true,
      source: {
        kind: 'asset', referenceId: 'asset-overlay', videoUrl: 'https://signed/overlay.mp4',
        sourceLabel: 'overlay.mp4',
      },
    });
    const canonicalize = vi.fn().mockResolvedValue(canonical('asset-overlay-canonical'));

    await resolveStyleReferenceSourceV1(
      { userId: 'user-1', projectId: 'project-1', videoOverlayId: '42' },
      {
        loadProject: async () => ({
          projectId: 'project-1', userId: 'user-1', title: 'Test', fps: 30,
          width: 1920, height: 1080, durationInFrames: 300,
          overlays: [{ id: 42, type: 'video', assetId: 'asset-overlay' }],
        } as never),
        resolveSource,
        canonicalize,
        assetResolver: resolver(),
      },
    );

    expect(resolveSource).toHaveBeenCalledWith(expect.objectContaining({
      referenceAssetId: 'asset-overlay', referenceVideoUrl: undefined,
    }));
  });

  it('accepts one valid pre-canonicalized handoff without repeating source work', async () => {
    const resolveSource = vi.fn();
    const canonicalize = vi.fn();
    const result = await resolveStyleReferenceSourceV1(
      { userId: 'user-1', canonicalSource: canonical('asset-issued') },
      { resolveSource, canonicalize, assetResolver: resolver() },
    );

    expect(result.referenceAssetId).toBe('asset-issued');
    expect(resolveSource).not.toHaveBeenCalled();
    expect(canonicalize).not.toHaveBeenCalled();
  });

  it('fails closed for ambiguous, rejected, or unregistered sources', async () => {
    await expect(resolveStyleReferenceSourceV1({
      userId: 'user-1', assetId: 'a', videoUrl: 'https://public.example/ref.mp4',
    })).rejects.toMatchObject({ code: 'ambiguous_target' });

    await expect(resolveStyleReferenceSourceV1({
      userId: 'user-1', videoOverlayId: '1',
    })).rejects.toMatchObject({ code: 'project_required' });

    await expect(resolveStyleReferenceSourceV1(
      { userId: 'user-1', assetId: 'missing' },
      {
        resolveSource: async () => ({
          ok: false, reason: 'reference_asset_not_found', diagnostics: ['not owned'], sourceKind: 'asset',
        }),
        assetResolver: resolver(),
      },
    )).rejects.toMatchObject({ code: 'source_rejected' });

    await expect(resolveStyleReferenceSourceV1({
      userId: 'user-1',
      canonicalSource: { ...canonical('asset-issued'), sourceRegistration: undefined },
    })).rejects.toBeInstanceOf(StyleReferenceSourceErrorV1);
  });

  it('keeps the main worker on the receipt-bearing handoff', () => {
    const worker = readFileSync(resolve(
      process.cwd(), 'app/api/internal/workers/video-analysis/route.ts',
    ), 'utf8');
    expect(worker).toContain('canonicalSource: canonicalReference');
    expect(worker).toContain('canonicalReference?.sourceRegistration');
    expect(worker).not.toContain('extractEditDNA({ videoUrl: refUrl');
  });
});

function canonical(assetId: string) {
  return {
    referenceAssetId: assetId,
    videoUrl: `https://cdn.example.test/${assetId}.mov`,
    canonicalKind: 'asset' as const,
    durationSec: 18,
    sourceLabel: 'reference.mov',
    sourceRegistration: {
      version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
      assetId,
      mediaOwner: { type: 'USER' as const, userId: 'user-1' },
      contentType: 'video/quicktime',
      byteLength: 1_000,
      bytesSha256: 'b'.repeat(64),
      storage: { backend: 'R2' as const, key: `users/user-1/${assetId}.mov` },
      provenance: {
        version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
        role: 'SOURCE' as const,
      },
      receiptSha256: 'a'.repeat(64),
    },
  };
}

function resolver() {
  return {
    getAsset: vi.fn(),
    resolveAssetUrl: vi.fn(),
  };
}
