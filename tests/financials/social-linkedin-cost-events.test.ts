import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('LinkedIn social provider cost telemetry contract', () => {
  it('records UploaderX LinkedIn provider events by upload and publish phase', () => {
    const route = readRepoFile('app/api/services/uploaderx/linkedin/route.ts');

    expect(route).toContain('recordUploaderXLinkedInCost({');
    expect(route).toContain('provider: UPLOADERX_LINKEDIN_PROVIDER');
    expect(route).toContain('model: UPLOADERX_LINKEDIN_MODEL');
    expect(route).toContain('route: UPLOADERX_LINKEDIN_ROUTE');
    expect(route).toContain('operation: "social_media_upload"');
    expect(route).toContain('operation: "social_publish"');
    expect(route).toContain('phase: "rest_video_initialize"');
    expect(route).toContain('phase: "rest_video_transfer"');
    expect(route).toContain('phase: "rest_video_finalize"');
    expect(route).toContain('phase: "rest_media_initialize"');
    expect(route).toContain('phase: "rest_media_transfer"');
    expect(route).toContain('phase: "legacy_media_register"');
    expect(route).toContain('phase: "legacy_media_transfer"');
    expect(route).toContain('phase: "post_create"');
    expect(route).toContain('bytesIn: input.chunkBytes');
    expect(route).toContain('providerStatusCode: input.providerStatusCode');
  });

  it('attaches LinkedIn publish revenue only after credit deduction returns a transaction', () => {
    const route = readRepoFile('app/api/services/uploaderx/linkedin/route.ts');

    expect(route).toContain('const deductResult = await deductPublishCredits(publishCreditCheck);');
    expect(route).toContain('chargedCredits: deductResult.transactionId ? UPLOADERX_LINKEDIN_PUBLISH_CREDITS : undefined');
    expect(route).toContain('creditTransactionId: deductResult.transactionId');
    expect(route).toContain('requestType: "linkedin"');
    expect(route).toContain('pendingCompletedProviderCost && !recordedPendingProviderCost');
  });

  it('keeps UploaderX LinkedIn provider-cost metadata free of content, tokens, and URLs', () => {
    const route = readRepoFile('app/api/services/uploaderx/linkedin/route.ts');
    const helper = route.slice(route.indexOf('async function recordUploaderXLinkedInCost'));

    expect(helper).not.toContain('title');
    expect(helper).not.toContain('description');
    expect(helper).not.toContain('postText');
    expect(helper).not.toContain('accessToken');
    expect(helper).not.toContain('refreshToken');
    expect(helper).not.toContain('clientSecret');
    expect(helper).not.toContain('uploadUrl');
    expect(helper).not.toContain('postUrl');
    expect(helper).not.toContain('publicUrl');
    expect(helper).not.toContain('organizationId');
    expect(helper).not.toContain('authorUrn');
    expect(helper).not.toContain('body:');
  });

  it('documents the partial T6 LinkedIn main-route telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-05: UploaderX LinkedIn main-route provider events are wired');
    expect(plan).toContain('LinkedIn API main-route pricing remains `pricing_to_be_seen`');
  });
});