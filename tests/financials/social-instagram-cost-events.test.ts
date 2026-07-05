import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Instagram social provider cost telemetry contract', () => {
  it('records UploaderX Instagram provider events by publish phase', () => {
    const route = readRepoFile('app/api/services/uploaderx/instagram/route.ts');

    expect(route).toContain('recordUploaderXInstagramCost({');
    expect(route).toContain('provider: UPLOADERX_INSTAGRAM_PROVIDER');
    expect(route).toContain('model: UPLOADERX_INSTAGRAM_MODEL');
    expect(route).toContain('route: UPLOADERX_INSTAGRAM_ROUTE');
    expect(route).toContain('operation: "social_media_upload"');
    expect(route).toContain('operation: "social_publish"');
    expect(route).toContain('phase: "container_create"');
    expect(route).toContain('phase: "chunk_transfer"');
    expect(route).toContain('phase: "status_poll"');
    expect(route).toContain('phase: "publish"');
    expect(route).toContain('uploadMethod: "direct"');
    expect(route).toContain('uploadMethod: "resumable"');
    expect(route).toContain('bytesIn: input.chunkBytes');
    expect(route).toContain('pollAttempts: input.pollAttempts');
  });

  it('records CalOS Instagram container and publish provider events without fake revenue', () => {
    const publisher = readRepoFile('lib/calos/publish/instagram.ts');

    expect(publisher).toContain('recordCalosInstagramPublishCost(params, {');
    expect(publisher).toContain('route: "lib/calos/publish/instagram"');
    expect(publisher).toContain('provider: "instagram-graph-api"');
    expect(publisher).toContain('operation: input.operation');
    expect(publisher).toContain('let phase: CalosInstagramCostPhase = "container_create"');
    expect(publisher).toContain('let operation: CalosInstagramCostOperation = "social_media_upload"');
    expect(publisher).toContain('phase = "publish"');
    expect(publisher).toContain('operation = "social_publish"');
    expect(publisher).toContain('units: { requestCount: 1 }');

    const helper = publisher.slice(publisher.indexOf('async function recordCalosInstagramPublishCost'));
    expect(helper).not.toContain('chargedCredits');
    expect(helper).not.toContain('creditTransactionId');
    expect(helper).not.toContain('caption');
    expect(helper).not.toContain('imageUrl');
    expect(helper).not.toContain('userAccessToken');
    expect(helper).not.toContain('access_token');
    expect(helper).not.toContain('postUrl');
    expect(helper).not.toContain('body:');
  });

  it('attaches Instagram publish revenue only after credit deduction returns a transaction', () => {
    const route = readRepoFile('app/api/services/uploaderx/instagram/route.ts');

    expect(route).toContain('const deductResult = await deductPublishCredits(publishCreditCheck);');
    expect(route).toContain('chargedCredits: deductResult.transactionId ? UPLOADERX_INSTAGRAM_PUBLISH_CREDITS : undefined');
    expect(route).toContain('creditTransactionId: deductResult.transactionId');
    expect(route).toContain('requestType: "instagram"');
    expect(route).toContain('pendingCompletedProviderCost && !recordedPendingProviderCost');
  });

  it('keeps UploaderX Instagram provider-cost metadata free of content, tokens, and URLs', () => {
    const route = readRepoFile('app/api/services/uploaderx/instagram/route.ts');
    const helper = route.slice(route.indexOf('async function recordUploaderXInstagramCost'));

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

  it('documents the partial T6 Instagram direct-route telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-05: UploaderX Instagram main-route provider events are wired');
    expect(plan).toContain('CalOS Facebook, Instagram, LinkedIn, and YouTube publisher events are wired');
    expect(plan).toContain('Instagram Graph API pricing remains `pricing_to_be_seen`');
  });
});
