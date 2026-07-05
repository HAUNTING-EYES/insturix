import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('X social provider cost telemetry contract', () => {
  it('records normal UploaderX X publish and media upload provider events', () => {
    const route = readRepoFile('app/api/services/uploaderx/twitter/route.ts');

    expect(route).toContain('recordUploaderXTwitterCost({');
    expect(route).toContain('operation: "social_publish"');
    expect(route).toContain('operation: "social_media_upload"');
    expect(route).toContain('route: "/api/services/uploaderx/twitter"');
    expect(route).toContain('provider: "x-api"');
    expect(route).toContain('model: "twitter-v2"');
    expect(route).toContain('mediaUploadRequestCount += mediaStatus.requestCount');
    expect(route).toContain('chargedCredits: deductResult.transactionId ? UPLOADERX_TWITTER_PUBLISH_CREDITS : undefined');
    expect(route).toContain('creditTransactionId: deductResult.transactionId');
  });

  it('records chunked UploaderX X media phases and final publish events', () => {
    const route = readRepoFile('app/api/services/uploaderx/twitter/chunk/route.ts');

    expect(route).toContain('route: "/api/services/uploaderx/twitter/chunk"');
    expect(route).toContain('operation: "social_media_upload"');
    expect(route).toContain('operation: "social_publish"');
    expect(route).toContain('phase: "start"');
    expect(route).toContain('phase: "transfer"');
    expect(route).toContain('phase: "finalize"');
    expect(route).toContain('phase: "poll"');
    expect(route).toContain('phase: "publish"');
    expect(route).toContain('chargedCredits: deductResult.transactionId ? UPLOADERX_TWITTER_PUBLISH_CREDITS : undefined');
    expect(route).toContain('creditTransactionId: deductResult.transactionId');
  });

  it('records CalOS X publish provider events without pretending publisher-level credits were charged', () => {
    const publisher = readRepoFile('lib/calos/publish/twitter.ts');

    expect(publisher).toContain('await recordCalosXPublishCost(params, result);');
    expect(publisher).toContain('service: "calos"');
    expect(publisher).toContain('action: "platform_publish"');
    expect(publisher).toContain('route: "lib/calos/publish/twitter"');
    expect(publisher).toContain('provider: "x-api"');
    expect(publisher).toContain('operation: "social_publish"');

    const helper = publisher.slice(publisher.indexOf('async function recordCalosXPublishCost'));
    expect(helper).not.toContain('chargedCredits');
    expect(helper).not.toContain('caption');
    expect(helper).not.toContain('title');
    expect(helper).not.toContain('text');
  });

  it('records CalOS Facebook, LinkedIn, and YouTube publish provider events without publisher-level credits', () => {
    const facebook = readRepoFile('lib/calos/publish/facebook.ts');
    const linkedin = readRepoFile('lib/calos/publish/linkedin.ts');
    const youtube = readRepoFile('lib/calos/publish/youtube.ts');

    expect(facebook).toContain('await recordCalosFacebookPublishCost(params, result);');
    expect(facebook).toContain('route: "lib/calos/publish/facebook"');
    expect(facebook).toContain('provider: "meta-graph-api"');
    expect(facebook).toContain('model: `facebook-${graphVersion()}`');
    expect(facebook).toContain('operation: "social_publish"');

    expect(linkedin).toContain('await recordCalosLinkedInPublishCost(params, result);');
    expect(linkedin).toContain('route: "lib/calos/publish/linkedin"');
    expect(linkedin).toContain('provider: "linkedin-api"');
    expect(linkedin).toContain('model: `linkedin-rest-${LINKEDIN_REST_API_VERSION}`');
    expect(linkedin).toContain('operation: "social_publish"');

    expect(youtube).toContain('if (result.providerAttempted) await recordCalosYouTubePublishCost(params, result);');
    expect(youtube).toContain('route: "lib/calos/publish/youtube"');
    expect(youtube).toContain('provider: "youtube-data-api"');
    expect(youtube).toContain('model: "youtube-v3"');
    expect(youtube).toContain('operation: "social_publish"');

    const helpers = [
      facebook.slice(facebook.indexOf('async function recordCalosFacebookPublishCost')),
      linkedin.slice(linkedin.indexOf('async function recordCalosLinkedInPublishCost')),
      youtube.slice(youtube.indexOf('async function recordCalosYouTubePublishCost')),
    ].join('\n');
    expect(helpers).not.toContain('chargedCredits');
    expect(helpers).not.toContain('accessToken');
    expect(helpers).not.toContain('refreshToken');
    expect(helpers).not.toContain('pageAccessToken');
    expect(helpers).not.toContain('caption');
    expect(helpers).not.toContain('message');
    expect(helpers).not.toContain('text');
    expect(helpers).not.toContain('title');
    expect(helpers).not.toContain('description');
    expect(helpers).not.toContain('videoUrl');
    expect(helpers).not.toContain('postUrl');
  });

  it('keeps UploaderX provider-cost metadata free of post bodies, OAuth tokens, and URLs', () => {
    const normalRoute = readRepoFile('app/api/services/uploaderx/twitter/route.ts');
    const chunkRoute = readRepoFile('app/api/services/uploaderx/twitter/chunk/route.ts');
    const normalHelperStart = normalRoute.indexOf('async function recordUploaderXTwitterCost');
    const normalHelperEnd = normalRoute.indexOf('async function pollMediaStatusV2');
    const chunkHelperStart = chunkRoute.indexOf('async function recordUploaderXTwitterCost');
    const normalHelper = normalRoute.slice(normalHelperStart, normalHelperEnd);
    const chunkHelper = chunkRoute.slice(chunkHelperStart);

    for (const helper of [normalHelper, chunkHelper]) {
      expect(helper).not.toContain('tweetText');
      expect(helper).not.toContain('tweetPayload');
      expect(helper).not.toContain('accessToken');
      expect(helper).not.toContain('refreshToken');
      expect(helper).not.toContain('tweetUrl');
      expect(helper).not.toContain('publicUrl');
      expect(helper).not.toContain('description');
      expect(helper).not.toContain('title');
    }
  });

  it('documents the partial T6 X social telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-03: UploaderX and CalOS X social provider events are wired');
    expect(plan).toContain('CalOS Facebook, Instagram, LinkedIn, and YouTube publisher events are wired');
    expect(plan).toContain('X API pricing remains `pricing_to_be_seen`');
  });
});