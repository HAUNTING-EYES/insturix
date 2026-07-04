import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('YouTube chunked social provider cost telemetry contract', () => {
  it('records UploaderX YouTube chunk-route provider events by upload phase', () => {
    const route = readRepoFile('app/api/services/uploaderx/youtube/chunk/route.ts');

    expect(route).toContain('recordUploaderXYouTubeChunkCost({');
    expect(route).toContain('provider: UPLOADERX_YOUTUBE_CHUNK_PROVIDER');
    expect(route).toContain('model: UPLOADERX_YOUTUBE_CHUNK_MODEL');
    expect(route).toContain('route: UPLOADERX_YOUTUBE_CHUNK_ROUTE');
    expect(route).toContain('operation: "social_media_upload"');
    expect(route).toContain('operation: "social_publish"');
    expect(route).toContain('operation: "social_thumbnail_upload"');
    expect(route).toContain('phase: "start"');
    expect(route).toContain('phase: "transfer"');
    expect(route).toContain('phase: "finish"');
    expect(route).toContain('phase: "thumbnail"');
    expect(route).toContain('uploadMode: "chunk"');
    expect(route).toContain('bytesIn: input.chunkBytes');
    expect(route).toContain('uploadFinished: input.uploadFinished');
  });

  it('attaches YouTube chunk publish revenue only after credit deduction returns a transaction', () => {
    const route = readRepoFile('app/api/services/uploaderx/youtube/chunk/route.ts');

    expect(route).toContain('const deductResult = await deductPublishCredits(publishCreditCheck);');
    expect(route).toContain('chargedCredits: deductResult.transactionId ? UPLOADERX_YOUTUBE_CHUNK_PUBLISH_CREDITS : undefined');
    expect(route).toContain('creditTransactionId: deductResult.transactionId');
    expect(route).toContain('requestType: "youtube"');
    expect(route).toContain('pendingCompletedProviderCost && !recordedPendingProviderCost');
  });

  it('keeps UploaderX YouTube chunk provider-cost metadata free of content, tokens, and URLs', () => {
    const route = readRepoFile('app/api/services/uploaderx/youtube/chunk/route.ts');
    const helper = route.slice(route.indexOf('async function recordUploaderXYouTubeChunkCost'));

    expect(helper).not.toContain('title');
    expect(helper).not.toContain('description');
    expect(helper).not.toContain('tags');
    expect(helper).not.toContain('accessToken');
    expect(helper).not.toContain('refreshToken');
    expect(helper).not.toContain('uploadUrl');
    expect(helper).not.toContain('youtubeUrl');
    expect(helper).not.toContain('thumbnailPublicUrl');
    expect(helper).not.toContain('publicUrl');
    expect(helper).not.toContain('body:');
  });

  it('documents the partial T6 YouTube chunk-route telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-05: UploaderX YouTube chunk-route provider events are wired');
    expect(plan).toContain('YouTube Data API chunk-route pricing remains `pricing_to_be_seen`');
  });
});