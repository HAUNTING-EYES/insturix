import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Facebook social provider cost telemetry contract', () => {
  it('records UploaderX Facebook direct-route provider events by provider phase', () => {
    const route = readRepoFile('app/api/services/uploaderx/facebook/route.ts');

    expect(route).toContain('recordUploaderXFacebookCost({');
    expect(route).toContain('provider: UPLOADERX_FACEBOOK_PROVIDER');
    expect(route).toContain('model: UPLOADERX_FACEBOOK_MODEL');
    expect(route).toContain('route: UPLOADERX_FACEBOOK_ROUTE');
    expect(route).toContain('operation: "social_publish"');
    expect(route).toContain('operation: "social_media_upload"');
    expect(route).toContain('phase: "update"');
    expect(route).toContain('phase: "simple_upload"');
    expect(route).toContain('phase: "start"');
    expect(route).toContain('phase: "transfer"');
    expect(route).toContain('phase: "finish"');
  });

  it('attaches Facebook publish revenue only after credit deduction returns a transaction', () => {
    const route = readRepoFile('app/api/services/uploaderx/facebook/route.ts');

    expect(route).toContain('const deductResult = await deductPublishCredits(publishCreditCheck);');
    expect(route).toContain('chargedCredits: deductResult.transactionId ? UPLOADERX_FACEBOOK_PUBLISH_CREDITS : undefined');
    expect(route).toContain('creditTransactionId: deductResult.transactionId');
    expect(route).toContain('requestType: "facebook"');
    expect(route).toContain('pendingCompletedProviderCost && !recordedPendingProviderCost');
  });

  it('keeps UploaderX Facebook provider-cost metadata free of content, tokens, and URLs', () => {
    const route = readRepoFile('app/api/services/uploaderx/facebook/route.ts');
    const helper = route.slice(route.indexOf('async function recordUploaderXFacebookCost'));

    expect(helper).not.toContain('finalTitle');
    expect(helper).not.toContain('finalDescription');
    expect(helper).not.toContain('description');
    expect(helper).not.toContain('title');
    expect(helper).not.toContain('pageAccessToken');
    expect(helper).not.toContain('userAccessToken');
    expect(helper).not.toContain('facebookUrl');
    expect(helper).not.toContain('publicUrl');
    expect(helper).not.toContain('access_token');
    expect(helper).not.toContain('body:');
  });

  it('documents the partial T6 Facebook direct-route telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-04: UploaderX Facebook direct-route provider events are wired');
    expect(plan).toContain('Meta Graph API pricing remains `pricing_to_be_seen`');
  });
});