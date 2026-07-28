import type { CalosPublishPlatform } from "@/schemas/calos-scheduled-publish";
import { publishToFacebook } from "./facebook";
import { publishToInstagram } from "./instagram";
import { publishToLinkedIn } from "./linkedin";
import { publishToTwitter } from "./twitter";
import { publishToYouTube } from "./youtube";

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
  imageUrl?: string | null; // public media URL: image (Instagram) or video (YouTube). From deliverable.assetUrl.
  videoUuid?: string;
  gcsPath?: string;
  options?: Record<string, unknown>;
}

export interface PublishResult {
  ok: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  /** true = transient; the worker still decides whether the provider outcome is safe to retry */
  retryable?: boolean;
  /** false = failure occurred before an irreversible provider call; true = the call started */
  providerAttempted?: boolean;
  /** HTTP response status returned by the provider, when one was received */
  responseStatus?: number;
}

export type Publisher = (params: PublishParams) => Promise<PublishResult>;

/**
 * Platform -> publisher map. Populated EXPLICITLY (deterministic; no import-side-effect
 * registration magic). Each registered publisher resolves the snapshotted account identity
 * in a server context and returns one shared result contract.
 *
 * Until a platform is registered, the sweeper FAILS LOUD ("no publisher") rather than
 * silently dropping a scheduled post.
 */
export const publishers: Partial<Record<CalosPublishPlatform, Publisher>> = {
  facebook: publishToFacebook,
  instagram: publishToInstagram,
  linkedin: publishToLinkedIn,
  twitter: publishToTwitter,
  youtube: publishToYouTube,
};

export function getPublisher(platform: CalosPublishPlatform): Publisher | undefined {
  return publishers[platform];
}
