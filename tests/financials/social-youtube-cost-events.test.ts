import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('YouTube social provider cost telemetry contract', () => {
  it('records UploaderX YouTube upload/update and thumbnail provider events', () => {
    const route = readRepoFile('app/api/services/uploaderx/youtube/route.ts');

    expect(route).toContain('recordUploaderXYouTubeCost({');
    expect(route).toContain('completedVideoProviderOperation = "social_publish"');
    expect(route).toContain('completedVideoProviderOperation = "social_media_upload"');
    expect(route).toContain('operation: completedVideoProviderOperation');
    expect(route).toContain('operation: "social_thumbnail_upload"');
    expect(route).toContain('route: UPLOADERX_YOUTUBE_ROUTE');
    expect(route).toContain('provider: UPLOADERX_YOUTUBE_PROVIDER');
    expect(route).toContain('model: UPLOADERX_YOUTUBE_MODEL');
    expect(route).toContain('chargedCredits: deductResult.transactionId ? UPLOADERX_YOUTUBE_PUBLISH_CREDITS : undefined');
    expect(route).toContain('creditTransactionId: deductResult.transactionId');
    expect(route).toContain('requestType: "youtube"');
  });

  it('records the legacy UploaderX YouTube GCS upload route without fake revenue', () => {
    const route = readRepoFile('app/api/services/uploaderx/youtube/upload/route.ts');

    expect(route).toContain('recordUploaderXLegacyYouTubeUploadCost({');
    expect(route).toContain('UPLOADERX_LEGACY_YOUTUBE_UPLOAD_ROUTE = "/api/services/uploaderx/youtube/upload"');
    expect(route).toContain('provider: UPLOADERX_LEGACY_YOUTUBE_PROVIDER');
    expect(route).toContain('model: UPLOADERX_LEGACY_YOUTUBE_MODEL');
    expect(route).toContain('operation: UPLOADERX_LEGACY_YOUTUBE_OPERATION');
    expect(route).toContain('routeMode: "legacy_gcs_upload"');
    expect(route).toContain('if (providerCallStarted && !providerCostRecorded)');

    const helper = route.slice(route.indexOf('async function recordUploaderXLegacyYouTubeUploadCost'));
    expect(helper).not.toContain('chargedCredits');
    expect(helper).not.toContain('creditTransactionId');
    expect(helper).not.toContain('title');
    expect(helper).not.toContain('description');
    expect(helper).not.toContain('email');
    expect(helper).not.toContain('tokens');
    expect(helper).not.toContain('gcsPath');
    expect(helper).not.toContain('body:');
  });

  it('keeps completed video spend visible if a later YouTube step fails', () => {
    const route = readRepoFile('app/api/services/uploaderx/youtube/route.ts');

    expect(route).toContain('completedVideoProviderOperation && !recordedCompletedVideoProviderCost');
    expect(route).toContain('attemptedProviderOperation !== completedVideoProviderOperation');
    expect(route).toContain('status: "failed"');
  });

  it('keeps UploaderX YouTube provider-cost metadata free of content, OAuth tokens, and URLs', () => {
    const route = readRepoFile('app/api/services/uploaderx/youtube/route.ts');
    const helper = route.slice(route.indexOf('async function recordUploaderXYouTubeCost'));

    expect(helper).not.toContain('title');
    expect(helper).not.toContain('description');
    expect(helper).not.toContain('tags');
    expect(helper).not.toContain('accessToken');
    expect(helper).not.toContain('refreshToken');
    expect(helper).not.toContain('youtubeUrl');
    expect(helper).not.toContain('thumbnailPublicUrl');
    expect(helper).not.toContain('publicUrl');
    expect(helper).not.toContain('body:');
  });

  it('documents the partial T6 YouTube telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-04: UploaderX YouTube provider events are wired');
    expect(plan).toContain('legacy GCS upload route provider events are wired');
    expect(plan).toContain('YouTube Data API pricing remains `pricing_to_be_seen`');
  });
});
