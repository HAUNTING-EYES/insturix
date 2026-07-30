import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildRenderDeliveryManifest,
  completeRenderDeliveryManifest,
  RenderDeliveryContractError,
  RenderDeliveryManifestSchema,
  resolveRenderDeliveryPlan,
} from '@/lib/editron/services/render-delivery-manifest';

const MUSIC = {
  id: 'music_1',
  type: 'sound',
  row: 1,
  from: 30,
  durationInFrames: 150,
  assetId: 'bgm_conditioned_1',
  musicRights: {
    mediaRole: 'music',
    source: 'library',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'library-license',
      sourceAssetId: 'library_source_1',
      licenseId: 'license_1',
    },
  },
  metadata: {
    sourceAssetId: 'library_source_1',
    catalogMetadata: {
      provider: 'epidemic-sound',
      providerTrackId: 'provider_track_1',
      title: 'Focused Momentum',
      artists: ['Example Artist'],
    },
    beatGrid: {
      beats: [
        { frame: 15, isDownbeat: true },
        { frame: 45, isDownbeat: false },
      ],
    },
  },
};

const REFERENCE_MUSIC = {
  ...MUSIC,
  id: 'reference_music_1',
  musicRights: {
    mediaRole: 'music',
    source: 'preview-only',
    userChoice: 'no-music',
    licensed: false,
  },
  audioRights: {
    mediaRole: 'music',
    source: 'preview-only',
    userChoice: 'no-music',
    licensed: false,
  },
  metadata: {
    assignment: { usageMode: 'reference-only' },
    referenceTrack: {
      provider: 'user-upload',
      title: 'Reference Track',
      artists: ['Reference Artist'],
      sourceAssetId: 'reference_source_1',
      bpm: 120,
    },
    beatGrid: {
      beats: [{ frame: 15, isDownbeat: true }],
    },
  },
};

const NON_MUSIC = [
  { id: 'video_1', type: 'video', row: 0, from: 0, durationInFrames: 240 },
  { id: 'voice_1', type: 'sound', row: 2, from: 0, durationInFrames: 240 },
  { id: 'sfx_1', type: 'sound', row: 6, from: 90, durationInFrames: 15 },
];

describe('render delivery manifest', () => {
  it('keeps embedded exports unchanged by default', () => {
    const overlays = [...NON_MUSIC, MUSIC];
    const plan = resolveRenderDeliveryPlan({ overlays, fps: 30, durationInFrames: 240 });

    expect(plan.mode).toBe('embedded');
    expect(plan.overlays).toEqual(overlays);
    expect(plan.music).toEqual({
      embedded: true,
      removedOverlayIds: [],
      handoff: null,
    });
  });

  it('CRITICAL: forces reference-only music into a clean-master plan', () => {
    const plan = resolveRenderDeliveryPlan({
      requestedMode: 'embedded',
      overlays: [...NON_MUSIC, REFERENCE_MUSIC],
      fps: 30,
      durationInFrames: 240,
    });

    expect(plan.mode).toBe('platform-native');
    expect(plan.overlays).toEqual(NON_MUSIC);
    expect(plan.music).toMatchObject({
      embedded: false,
      removedOverlayIds: ['reference_music_1'],
      handoff: {
        track: {
          status: 'reference-ready',
          title: 'Reference Track',
          artists: ['Reference Artist'],
          sourceAssetId: 'reference_source_1',
          bpm: 120,
        },
        timing: {
          timelineStartFrame: 30,
          timelineEndFrame: 180,
          timelineBeatEntryFrame: 45,
        },
      },
    });
  });

  it('creates a clean-master plan without deleting voice, SFX, or video audio', () => {
    const plan = resolveRenderDeliveryPlan({
      requestedMode: 'platform-native',
      overlays: [...NON_MUSIC, MUSIC],
      fps: 30,
      durationInFrames: 240,
      destinationPlatform: 'instagram',
    });

    expect(plan.overlays.map((overlay: any) => overlay.id)).toEqual([
      'video_1',
      'voice_1',
      'sfx_1',
    ]);
    expect(plan.music.removedOverlayIds).toEqual(['music_1']);
    expect(plan.music.handoff).toMatchObject({
      destinationPlatform: 'instagram',
      attachmentOwner: 'destination-platform',
      track: {
        status: 'reference-ready',
        provider: 'epidemic-sound',
        providerTrackId: 'provider_track_1',
        title: 'Focused Momentum',
        artists: ['Example Artist'],
        sourceAssetId: 'library_source_1',
        usage: 'reference-only',
      },
      timing: {
        timelineStartFrame: 30,
        timelineEndFrame: 180,
        timelineStartMs: 1_000,
        timelineEndMs: 6_000,
        timelineBeatEntryFrame: 45,
        timelineBeatEntryMs: 1_500,
        platformTrackSourceOffsetMs: null,
        cueStatus: 'manual-cue-required',
      },
    });
  });

  it('states manual selection honestly when no track reference exists', () => {
    const plan = resolveRenderDeliveryPlan({
      requestedMode: 'platform-native',
      overlays: NON_MUSIC,
      fps: 30,
      durationInFrames: 240,
      destinationPlatform: 'tiktok',
    });

    expect(plan.overlays).toEqual(NON_MUSIC);
    expect(plan.music.handoff).toMatchObject({
      track: {
        status: 'manual-selection-required',
        provider: null,
        providerTrackId: null,
        title: null,
        sourceAssetId: null,
      },
      timing: {
        timelineStartFrame: 0,
        timelineEndFrame: 240,
        timelineBeatEntryFrame: null,
        platformTrackSourceOffsetMs: null,
        cueStatus: 'manual-cue-required',
      },
    });
  });

  it('builds and completes a mode-consistent artifact receipt', () => {
    const plan = resolveRenderDeliveryPlan({
      requestedMode: 'platform-native',
      overlays: [...NON_MUSIC, MUSIC],
      fps: 30,
      durationInFrames: 240,
    });
    const manifest = buildRenderDeliveryManifest({
      plan,
      renderId: 'render_clean_1',
      createdAt: '2026-07-26T00:00:00.000Z',
    });
    const completed = completeRenderDeliveryManifest(
      manifest,
      'https://cdn.example/clean-master.mp4',
      '2026-07-26T00:05:00.000Z',
    );

    expect(manifest).toMatchObject({
      mode: 'platform-native',
      primaryArtifact: {
        kind: 'clean-master',
        renderId: 'render_clean_1',
        status: 'rendering',
        url: null,
      },
      music: { embedded: false },
    });
    expect(completed).toMatchObject({
      completedAt: '2026-07-26T00:05:00.000Z',
      primaryArtifact: {
        kind: 'clean-master',
        status: 'ready',
        url: 'https://cdn.example/clean-master.mp4',
      },
    });
  });

  it('rejects invalid modes, empty completion URLs, and inconsistent manifests', () => {
    expect(() => resolveRenderDeliveryPlan({
      requestedMode: 'spotify-audio',
      overlays: [],
    })).toThrow(RenderDeliveryContractError);

    const embedded = buildRenderDeliveryManifest({
      plan: resolveRenderDeliveryPlan({ overlays: [] }),
      renderId: 'render_embedded_1',
      createdAt: '2026-07-26T00:00:00.000Z',
    });
    expect(() => completeRenderDeliveryManifest(embedded, ' ')).toThrow(
      RenderDeliveryContractError,
    );
    expect(RenderDeliveryManifestSchema.safeParse({
      ...embedded,
      primaryArtifact: {
        ...embedded.primaryArtifact,
        kind: 'clean-master',
      },
    }).success).toBe(false);
  });

  it('persists the delivery receipt at admission and on both render paths', () => {
    const renderRoute = readFileSync(
      'app/api/services/editron/cloudrun/render/route.ts',
      'utf8',
    );
    const jobService = readFileSync(
      'lib/editron/services/render-job-service.ts',
      'utf8',
    );

    expect(renderRoute.indexOf('verifyRenderAudioRightsAuthority({')).toBeLessThan(
      renderRoute.indexOf('resolveRenderDeliveryPlan({'),
    );
    expect(renderRoute.indexOf('resolveRenderDeliveryPlan({')).toBeLessThan(
      renderRoute.indexOf('assetResolver.resolveProjectAssets'),
    );
    expect(renderRoute.indexOf('resolveRenderDeliveryPlan({')).toBeLessThan(
      renderRoute.indexOf("checkCredits(userId, 'editron', 'render_export'"),
    );
    expect(renderRoute.indexOf('reserveJob(')).toBeLessThan(
      renderRoute.indexOf('renderMediaOnLambda({'),
    );
    expect(renderRoute.indexOf('reserveJob(')).toBeLessThan(
      renderRoute.indexOf('startChapterRender('),
    );
    expect(renderRoute.match(/buildRenderDeliveryManifest\(\{/g)).toHaveLength(1);
    expect(renderRoute).not.toContain('await createJob(');
    expect(jobService).toContain('completeRenderDeliveryManifest(');
    expect(jobService.indexOf('completeRenderDeliveryManifest(')).toBeLessThan(
      jobService.indexOf("status: 'done'"),
    );
  });
});
