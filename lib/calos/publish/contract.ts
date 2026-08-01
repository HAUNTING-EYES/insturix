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

export type RegisteredCalosPublishPlatform = Exclude<CalosPublishPlatform, "tiktok">;
export type PublisherMediaKind = "none" | "image" | "video";

export interface PublisherCapability {
  label: string;
  defaultFormat: string;
  supportedFormats: readonly string[];
  requiredMedia: PublisherMediaKind;
}

export const publisherCapabilities: Record<
  RegisteredCalosPublishPlatform,
  PublisherCapability
> = {
  facebook: {
    label: "Facebook",
    defaultFormat: "text",
    supportedFormats: ["text"],
    requiredMedia: "none",
  },
  instagram: {
    label: "Instagram",
    defaultFormat: "image",
    supportedFormats: ["image"],
    requiredMedia: "image",
  },
  linkedin: {
    label: "LinkedIn",
    defaultFormat: "text",
    supportedFormats: ["text"],
    requiredMedia: "none",
  },
  twitter: {
    label: "X",
    defaultFormat: "text",
    supportedFormats: ["text"],
    requiredMedia: "none",
  },
  youtube: {
    label: "YouTube",
    defaultFormat: "video",
    supportedFormats: ["video", "short_video", "long_video"],
    requiredMedia: "video",
  },
};

export type PublishReadinessResult =
  | { ok: true; format: string; mediaKind: PublisherMediaKind }
  | { ok: false; error: string };

export function validatePublishReadiness(input: {
  platform: RegisteredCalosPublishPlatform;
  contentFormat?: string | null;
  assetUrl?: string | null;
  copyText?: string | null;
}): PublishReadinessResult {
  const capability = publisherCapabilities[input.platform];
  const explicitFormat = input.contentFormat?.trim().toLowerCase() ?? "";
  const format = explicitFormat || capability.defaultFormat;

  if (!capability.supportedFormats.includes(format)) {
    const supported = capability.supportedFormats
      .map((value) => value.replaceAll("_", " "))
      .join(", ");
    return {
      ok: false,
      error: `Automatic ${capability.label} publishing currently supports ${supported} posts only. "${format}" requires a different publishing path.`,
    };
  }

  if (capability.requiredMedia !== "none" && !input.assetUrl?.trim()) {
    const readableFormat = format.replaceAll("_", " ");
    return {
      ok: false,
      error: `${capability.label} ${readableFormat} posts require a generated or uploaded ${capability.requiredMedia} before approval.`,
    };
  }

  if (capability.requiredMedia === "none" && !input.copyText?.trim()) {
    return {
      ok: false,
      error: `${capability.label} text posts require copy before approval.`,
    };
  }

  return { ok: true, format, mediaKind: capability.requiredMedia };
}

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
