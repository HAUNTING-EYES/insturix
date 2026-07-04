import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Facebook chunked social provider cost telemetry contract', () => {
  it('records UploaderX Facebook chunk-route provider events by upload phase', () => {
    const route = readRepoFile('app/api/services/uploaderx/facebook/chunk/route.ts');

    expect(route).toContain('recordUploaderXFacebookChunkCost({');
    expect(route).toContain('provider: UPLOADERX_FACEBOOK_CHUNK_PROVIDER');
    expect(route).toContain('model: UPLOADERX_FACEBOOK_CHUNK_MODEL');
    expect(route).toContain('route: UPLOADERX_FACEBOOK_CHUNK_ROUTE');
    expect(route).toContain('operation: "social_media_upload"');
    expect(route).toContain('phase: "start"');
    expect(route).toContain('phase: "transfer"');
    expect(route).toContain('phase: "finish"');
    expect(route).toContain('uploadMode: "chunk"');
    expect(route).toContain('bytesIn: input.chunkBytes');
  });

  it('attaches Facebook chunk publish revenue only after credit deduction returns a transaction', () => {
    const route = readRepoFile('app/api/services/uploaderx/facebook/chunk/route.ts');

    expect(route).toContain('const deductResult = await deductPublishCredits(publishCreditCheck);');
    expect(route).toContain('chargedCredits: deductResult.transactionId ? UPLOADERX_FACEBOOK_CHUNK_PUBLISH_CREDITS : undefined');
    expect(route).toContain('creditTransactionId: deductResult.transactionId');
    expect(route).toContain('requestType: "facebook"');
    expect(route).toContain('pendingCompletedProviderCost && !recordedPendingProviderCost');
  });

  it('keeps UploaderX Facebook chunk provider-cost metadata free of content, tokens, and URLs', () => {
    const route = readRepoFile('app/api/services/uploaderx/facebook/chunk/route.ts');
    const helper = route.slice(route.indexOf('async function recordUploaderXFacebookChunkCost'));

    expect(helper).not.toContain('finalTitle');
    expect(helper).not.toContain('finalDescription');
    expect(helper).not.toContain('description');
    expect(helper).not.toContain('title');
    expect(helper).not.toContain('pageAccessToken');
    expect(helper).not.toContain('userAccessToken');
    expect(helper).not.toContain('facebookUrl');
    expect(helper).not.toContain('publicUrl');
    expect(helper).not.toContain('access_token');
    expect(helper).not.toContain('uploadUrl');
    expect(helper).not.toContain('body:');
    expect(helper).not.toContain('pageName');
  });

  it('documents the partial T6 Facebook chunk-route telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-05: UploaderX Facebook chunk-route provider events are wired');
    expect(plan).toContain('Meta Graph API chunk-route pricing remains `pricing_to_be_seen`');
  });
});
