import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Instagram chunked social provider cost telemetry contract', () => {
  it('records UploaderX Instagram chunk-route provider events by upload phase', () => {
    const route = readRepoFile('app/api/services/uploaderx/instagram/chunk/route.ts');

    expect(route).toContain('recordUploaderXInstagramChunkCost({');
    expect(route).toContain('provider: UPLOADERX_INSTAGRAM_CHUNK_PROVIDER');
    expect(route).toContain('model: UPLOADERX_INSTAGRAM_CHUNK_MODEL');
    expect(route).toContain('route: UPLOADERX_INSTAGRAM_CHUNK_ROUTE');
    expect(route).toContain('operation: "social_media_upload"');
    expect(route).toContain('operation: "social_publish"');
    expect(route).toContain('phase: "container_create"');
    expect(route).toContain('phase: "chunk_transfer"');
    expect(route).toContain('phase: "status_poll"');
    expect(route).toContain('phase: "publish"');
    expect(route).toContain('uploadMode: "chunk"');
    expect(route).toContain('uploadMethod: input.uploadMethod');
    expect(route).toContain('bytesIn: input.chunkBytes');
    expect(route).toContain('providerStatusCode: input.providerStatusCode');
  });

  it('attaches Instagram chunk publish revenue only after credit deduction returns a transaction', () => {
    const route = readRepoFile('app/api/services/uploaderx/instagram/chunk/route.ts');

    expect(route).toContain('const deductResult = await deductPublishCredits(publishCreditCheck);');
    expect(route).toContain('chargedCredits: deductResult.transactionId ? UPLOADERX_INSTAGRAM_CHUNK_PUBLISH_CREDITS : undefined');
    expect(route).toContain('creditTransactionId: deductResult.transactionId');
    expect(route).toContain('requestType: "instagram"');
    expect(route).toContain('pendingCompletedProviderCost && !recordedPendingProviderCost');
  });

  it('keeps UploaderX Instagram chunk provider-cost metadata free of content, tokens, and URLs', () => {
    const route = readRepoFile('app/api/services/uploaderx/instagram/chunk/route.ts');
    const helper = route.slice(route.indexOf('async function recordUploaderXInstagramChunkCost'));

    expect(helper).not.toContain('finalCaption');
    expect(helper).not.toContain('finalDescription');
    expect(helper).not.toContain('fullCaption');
    expect(helper).not.toContain('description');
    expect(helper).not.toContain('title');
    expect(helper).not.toContain('igUserAccessToken');
    expect(helper).not.toContain('access_token');
    expect(helper).not.toContain('instagramUrl');
    expect(helper).not.toContain('mediaUrl');
    expect(helper).not.toContain('publicUrl');
    expect(helper).not.toContain('instagramUsername');
    expect(helper).not.toContain('body:');
  });

  it('documents the partial T6 Instagram chunk-route telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-05: UploaderX Instagram chunk-route provider events are wired');
    expect(plan).toContain('Instagram Graph API chunk-route pricing remains `pricing_to_be_seen`');
  });
});
