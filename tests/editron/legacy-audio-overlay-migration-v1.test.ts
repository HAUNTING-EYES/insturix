import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planLegacyAudioOverlayMigrationV1 } from '@/lib/editron/services/legacy-audio-overlay-migration-v1';

describe('legacy audio overlay migration V1', () => {
  it('appends uniquely identified BGM and SFX without changing existing overlays', () => {
    const existing = { id: 'video_1', type: 'video', row: 1 };
    const bgm = { id: 'bgm_1', assetId: 'asset_bgm', type: 'sound', row: 5 };
    const sfx = { id: 'sfx_1', assetId: 'asset_sfx', type: 'sound', row: 6 };
    const plan = planLegacyAudioOverlayMigrationV1({
      topLevelOverlays: [existing],
      legacyStateOverlays: [bgm, sfx],
    });

    expect(plan).toMatchObject({
      disposition: 'READY',
      migratedIdentities: ['asset:asset_bgm', 'asset:asset_sfx'],
    });
    expect(plan.overlays).toEqual([existing, bgm, sfx]);
  });

  it('is idempotent when the top-level audio identities already exist', () => {
    const bgm = { id: 'bgm_1', assetId: 'asset_bgm', type: 'sound', row: 5 };
    expect(planLegacyAudioOverlayMigrationV1({
      topLevelOverlays: [bgm],
      legacyStateOverlays: [bgm],
    })).toEqual({
      disposition: 'NO_CHANGES',
      overlays: [bgm],
      migratedIdentities: [],
    });
  });

  it('blocks a candidate whose durable identity is missing', () => {
    expect(planLegacyAudioOverlayMigrationV1({
      topLevelOverlays: [],
      legacyStateOverlays: [{ type: 'sound', row: 5 }],
    })).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'MISSING_OVERLAY_IDENTITY',
    });
  });

  it('blocks malformed top-level state instead of filtering and deleting it', () => {
    expect(planLegacyAudioOverlayMigrationV1({
      topLevelOverlays: [{ id: 'video_1', type: 'video' }, null],
      legacyStateOverlays: [{ id: 'bgm_1', type: 'sound', row: 5 }],
    })).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'INVALID_TOP_LEVEL_OVERLAYS',
    });
  });

  it('blocks duplicate legacy identities instead of choosing one overlay', () => {
    expect(planLegacyAudioOverlayMigrationV1({
      topLevelOverlays: [],
      legacyStateOverlays: [
        { id: 'bgm_1', assetId: 'asset_bgm', type: 'sound', row: 5 },
        { id: 'bgm_2', assetId: 'asset_bgm', type: 'sound', row: 5 },
      ],
    })).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'DUPLICATE_LEGACY_OVERLAY_IDENTITY',
    });
  });

  it('makes the HTTP migration explicit, bounded and ProjectService-owned', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/internal/migrate-audio/route.ts'),
      'utf8',
    );
    expect(source).toContain('process.env.EDITRON_MIGRATION_SECRET');
    expect(source).toContain("request.headers.get('authorization')");
    expect(source).toContain('.limit(100)');
    expect(source).toContain('projectService.loadProjectForMutation(userId, projectId)');
    expect(source).toContain('projectService.saveProjectWithReceipt(');
    expect(source).toContain('expectedRevision: snapshot.revision');
    expect(source).not.toContain('collection<AudioMigrationProject>(COLLECTIONS.PROJECTS).updateOne');
  });
});
