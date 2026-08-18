import { describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
  resolveThinkForgePlatformSurfaceFromLabel,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import {
  pairThinkForgeAuthoringRequestMigrationSources,
  planThinkForgeAuthoringRequestMigration,
} from '@/lib/thinkforge/migrations/authoring-request-v1';
import {
  buildThinkForgeAuthoringRequestV1RollbackUpdate,
  createThinkForgeAuthoringRequestV1Backup,
} from '@/lib/thinkforge/migrations/authoring-request-backup-v1';

function plan(projectMeta: Record<string, unknown>) {
  return planThinkForgeAuthoringRequestMigration([{ _id: 'session_1', projectMeta }]);
}

describe('ThinkForge authoring request migration', () => {
  it('preserves and canonicalizes a valid existing request', () => {
    const request = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: resolveThinkForgePlatformSurfaceFromLabel('YouTube'),
      targetDurationSec: 420,
    });
    const result = plan({ authoringRequest: request, contentContract: request.contentContract, platform: 'YouTube', durationSec: 420 });

    expect(result.summary).toEqual({ scanned: 1, active: 1, quarantined: 0 });
    expect(result.decisions[0]).toMatchObject({ status: 'active', source: 'existing_authoring_request', authoringRequest: request });
  });

  it('builds a script request only from explicit compatible session fields', () => {
    const result = plan({
      contentContract: createThinkForgeWriterContract('video_script'),
      format: 'YouTube video script',
      platform: 'YouTube',
      durationSec: 420,
    });

    expect(result.decisions[0]).toMatchObject({
      status: 'active',
      source: 'explicit_session_fields',
      authoringRequest: { targetDurationSec: 420, platformSurface: { id: 'youtube' } },
      update: { $set: { 'projectMeta.format': '7-minute YouTube video script' } },
    });
  });

  it('requires explicit controls and slide count for legacy post forms', () => {
    const controls = createDefaultThinkForgePostControls();
    const post = plan({
      contentContract: createThinkForgeWriterContract('social_post'),
      platform: 'LinkedIn',
      postControls: controls,
    });
    const carousel = plan({
      contentContract: createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 }),
      platform: 'Instagram',
      postControls: controls,
    });

    expect(post.decisions[0]).toMatchObject({ status: 'active', authoringRequest: { postControls: controls } });
    expect(carousel.decisions[0]).toMatchObject({
      status: 'active',
      authoringRequest: { contentContract: { outputKind: 'carousel', carouselSlideCount: 5 } },
    });
  });

  it.each([
    ['missing project metadata', undefined, 'projectMeta must be an object'],
    ['missing contract', { platform: 'YouTube' }, 'contentContract is missing or invalid'],
    ['missing platform', { contentContract: createThinkForgeWriterContract('video_script') }, 'platform is missing'],
    ['missing post controls', { contentContract: createThinkForgeWriterContract('social_post'), platform: 'LinkedIn' }, 'missing explicit post controls'],
    ['invalid duration', { contentContract: createThinkForgeWriterContract('video_script'), platform: 'YouTube', durationSec: 7.5 }, 'positive whole number'],
    ['post with duration', { contentContract: createThinkForgeWriterContract('social_post'), platform: 'LinkedIn', durationSec: 30, postControls: createDefaultThinkForgePostControls() }, 'script-only duration'],
    ['conflicting format', { contentContract: createThinkForgeWriterContract('social_post'), format: 'video script', platform: 'LinkedIn', postControls: createDefaultThinkForgePostControls() }, 'format conflicts'],
  ])('quarantines %s instead of guessing', (_name, projectMeta, reason) => {
    const result = planThinkForgeAuthoringRequestMigration([{ _id: 'session_1', projectMeta }]);
    expect(result.decisions[0]).toMatchObject({ status: 'quarantined' });
    expect((result.decisions[0] as { reason: string }).reason).toContain(reason);
  });

  it('quarantines conflicting compatibility fields beside an existing request', () => {
    const request = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' },
      targetDurationSec: 420,
    });
    const result = plan({ authoringRequest: request, platform: 'LinkedIn', durationSec: 60 });

    expect(result.decisions[0]).toMatchObject({ status: 'quarantined', reason: 'session platform conflicts with authoringRequest' });
  });

  it('restores every migrated field exactly and removes the backup marker', () => {
    const capturedAt = new Date('2026-08-16T00:00:00.000Z');
    const backup = createThinkForgeAuthoringRequestV1Backup({
      format: 'Old format',
      platform: 'Old platform',
      durationSec: 60,
    }, capturedAt);
    const rollback = buildThinkForgeAuthoringRequestV1RollbackUpdate(backup);

    expect(rollback.$set).toMatchObject({
      'projectMeta.format': 'Old format',
      'projectMeta.platform': 'Old platform',
      'projectMeta.durationSec': 60,
    });
    expect(rollback.$unset).toMatchObject({
      authoringRequestV1Backup: '',
      'projectMeta.authoringRequest': '',
      'projectMeta.contentContract': '',
      'projectMeta.authoringRequestMigration': '',
    });
  });

  it('preserves native identities when a string ID and ObjectId have the same display value', () => {
    const displayId = '695dfb1196fc478cb16f9a3b';
    const objectId = new ObjectId(displayId);
    const projectMeta = {
      contentContract: createThinkForgeWriterContract('video_script'),
      platform: 'YouTube',
      durationSec: 420,
    };
    const sources = [
      { _id: displayId, projectMeta },
      { _id: objectId, projectMeta },
    ];
    const migrationPlan = planThinkForgeAuthoringRequestMigration(sources.map((source) => ({
      _id: String(source._id),
      projectMeta: source.projectMeta,
    })));

    const pairs = pairThinkForgeAuthoringRequestMigrationSources(sources, migrationPlan);

    expect(pairs).toHaveLength(2);
    expect(pairs[0]?.source._id).toBe(displayId);
    expect(pairs[1]?.source._id).toBe(objectId);
    expect(pairs.map(({ decision }) => decision.sessionId)).toEqual([displayId, displayId]);
  });

  it('fails closed when the planner no longer has a one-to-one source order', () => {
    const migrationPlan = planThinkForgeAuthoringRequestMigration([
      { _id: 'session_1', projectMeta: {} },
    ]);

    expect(() => pairThinkForgeAuthoringRequestMigrationSources([], migrationPlan))
      .toThrow('source count drift');
    expect(() => pairThinkForgeAuthoringRequestMigrationSources(
      [{ _id: 'session_2', projectMeta: {} }],
      migrationPlan,
    )).toThrow('source order drift');
  });
});
