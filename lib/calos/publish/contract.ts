import type { CalosPublishPlatform } from "@/schemas/calos-scheduled-publish";
import { publishToFacebook } from "./facebook";
import { publishToInstagram } from "./instagram";
import { publishToLinkedIn } from "./linkedin";
import { publishToTwitter } from "./twitter";

/**
 * Inputs a CalOS publisher needs to post on behalf of a brand from a SERVER (cron)
 * context with NO Clerk session. `ownerUserId` is the connected-account owner whose
 * stored token performs the publish (verified reachable server-side in the publish
 * spike: FB/IG/LI/X tokens live in the User doc; YouTube via Clerk getUserOauthAccessToken).
 */
export interface PublishParams {
  ownerUserId: string;
  deliverableId: string;
  brandId?: string;
  accountRef?: string; // page / account / organization id on the platform
  caption?: string;
  title?: string;
  imageUrl?: string | null; // public image URL for media platforms (Instagram requires it)
  videoUuid?: string;
  gcsPath?: string;
  options?: Record<string, unknown>;
}

export interface PublishResult {
  ok: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  /** true = transient (network/5xx/rate-limit), safe to retry; false = permanent (bad token, validation) */
  retryable?: boolean;
}

export type Publisher = (params: PublishParams) => Promise<PublishResult>;

/**
 * Platform -> publisher map. Populated EXPLICITLY (deterministic; no import-side-effect
 * registration magic). Intentionally EMPTY here: each platform publisher is wired in the
 * authed dev environment where a real post can be verified end-to-end. The LinkedIn
 * publisher is extracted from app/api/services/uploaderx/linkedin/route.ts into
 * lib/calos/publish/linkedin.ts as publishToLinkedIn(params), then registered below.
 *
 * Until a platform is registered, the sweeper FAILS LOUD ("no publisher") rather than
 * silently dropping a scheduled post.
 */
export const publishers: Partial<Record<CalosPublishPlatform, Publisher>> = {
  facebook: publishToFacebook,
  instagram: publishToInstagram,
  linkedin: publishToLinkedIn,
  twitter: publishToTwitter,
  // youtube: publishToYouTube,
};

export function getPublisher(platform: CalosPublishPlatform): Publisher | undefined {
  return publishers[platform];
}
