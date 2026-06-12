export const PlatformPostTypes = {
  instagram: ["reel", "feed_video"],
  youtube: ["short", "video"],
  facebook: ["reel", "video"],
  linkedin: ["video"],
  x: ["video"],
} as const;

export type UploaderXPlatform = keyof typeof PlatformPostTypes | "twitter";

export interface VideoMetadata {
  duration: number; // in seconds
  width: number;
  height: number;
  aspectRatio: string;
  orientation: "vertical" | "horizontal" | "square";
  fileSize?: number;
}

export interface PlatformDetectionResult {
  recommended: string;
  available: string[];
  reason: string;
  warnings?: string[];
}

export interface DetectionResult {
  instagram: PlatformDetectionResult;
  youtube: PlatformDetectionResult;
  facebook: PlatformDetectionResult;
  linkedin: PlatformDetectionResult;
  x: PlatformDetectionResult;
  twitter: PlatformDetectionResult;
}

export function detectPostTypes(
  meta: VideoMetadata,
): DetectionResult {
  const { duration, orientation, fileSize } = meta;
  const isVerticalOrSquare =
    orientation === "vertical" || orientation === "square";

  // ── YouTube ──────────────────────────────────────────────────
  // Rule: vertical/square AND <= 180s = Short (since Oct 2024)
  const ytIsShort = duration <= 180 && isVerticalOrSquare;
  const youtube: PlatformDetectionResult = {
    recommended: ytIsShort ? "short" : "video",
    available: ytIsShort ? ["short", "video"] : ["video"],
    reason: ytIsShort
      ? `${Math.round(duration)}s vertical → Short`
      : !isVerticalOrSquare
        ? "Horizontal — cannot be a Short"
        : `${Math.round(duration)}s > 180s — Regular Video`,
  };

  // ── Instagram ────────────────────────────────────────────────
  // Rule: <= 1200s (20 min) = Reel. > 1200s = Feed Video.
  const igIsReel = duration <= 1200;
  const instagram: PlatformDetectionResult = {
    recommended: igIsReel ? "reel" : "feed_video",
    available: igIsReel ? ["reel"] : ["feed_video"],
    reason:
      duration <= 90
        ? "≤90s Reel — max reach"
        : duration <= 180
          ? "≤3 min Reel — good reach"
          : duration <= 1200
            ? "Reel — >3 min, reduced non-follower discovery"
            : "Feed Video — over 20 min Reel limit",
    warnings:
      duration > 180 && duration <= 1200
        ? ["Reels >3 min get reduced discovery to non-followers"]
        : undefined,
  };

  // ── Facebook ─────────────────────────────────────────────────
  // Rule: vertical/square AND <= 90s = Reel. Otherwise Feed Video.
  const fbIsReel = duration <= 90 && isVerticalOrSquare;
  const facebook: PlatformDetectionResult = {
    recommended: fbIsReel ? "reel" : "feed_video",
    available: duration <= 90 ? ["reel", "feed_video"] : ["feed_video"],
    reason: fbIsReel
      ? "≤90s + vertical → Facebook Reel"
      : duration <= 14400
        ? "Feed video post"
        : "Exceeds Facebook 4-hour limit",
    warnings:
      duration <= 90 && !isVerticalOrSquare
        ? ["Horizontal video — Reels prefer vertical/square"]
        : undefined,
  };

  // ── X / Twitter ───────────────────────────────────────────────
  // Free: 140s / 512 MB | Premium: 7200s / 8 GB | Premium+: 14400s / 16 GB
  const xWarnings: string[] = [];
  let xReason = "";
  if (duration <= 140) {
    xReason = `${Math.round(duration)}s — within free limit (2:20)`;
  } else if (duration <= 7200) {
    xReason = "Requires X Premium (up to 2 hr)";
    xWarnings.push("Exceeds free account limit (2:20). X Premium required.");
  } else if (duration <= 14400) {
    xReason = "Requires X Premium Plus (up to 4 hr)";
    xWarnings.push("Requires X Premium Plus.");
  } else {
    xReason = "Exceeds X maximum of 4 hr — cannot post";
    xWarnings.push(
      "Video is too long for X even with Premium Plus (max 4 hr).",
    );
  }
  const x: PlatformDetectionResult = {
    recommended: "video",
    available: ["video"],
    reason: xReason,
    warnings: xWarnings.length ? xWarnings : undefined,
  };

  // ── LinkedIn ──────────────────────────────────────────────────
  // Native video: 3s – 600s (10 min), max 5 GB
  const liWarnings: string[] = [];
  if (duration > 600)
    liWarnings.push("Exceeds LinkedIn 10-min limit. Please trim.");
  if (fileSize && fileSize > 5 * 1024 * 1024 * 1024)
    liWarnings.push("File exceeds LinkedIn 5 GB limit.");
  const linkedin: PlatformDetectionResult = {
    recommended: "video",
    available: ["video"],
    reason:
      duration <= 600
        ? isVerticalOrSquare
          ? "Vertical native video post"
          : "Landscape native video post"
        : "Over 10-min LinkedIn limit — trim required",
    warnings: liWarnings.length ? liWarnings : undefined,
  };

  return { youtube, instagram, facebook, x, twitter: x, linkedin };
}

export function validatePostType(
  platform: string,
  postType: string,
  meta: VideoMetadata,
): { valid: boolean; error?: string } {
  const { duration, orientation, fileSize } = meta;
  const isVerticalOrSquare =
    orientation === "vertical" || orientation === "square";

  switch (platform) {
    case "youtube":
      if (postType === "short") {
        if (duration > 180)
          return {
            valid: false,
            error: "YouTube Shorts must be 180s (3 min) or under.",
          };
        if (!isVerticalOrSquare)
          return {
            valid: false,
            error: "YouTube Shorts require vertical or square orientation.",
          };
      }
      if (fileSize && fileSize > 256 * 1024 * 1024 * 1024)
        return { valid: false, error: "YouTube file limit is 256 GB." };
      return { valid: true };

    case "instagram":
      if (postType === "reel" && duration > 1200)
        return {
          valid: false,
          error: "Instagram Reels max is 20 min (1200s).",
        };
      if (postType === "feed_video" && duration > 3600)
        return { valid: false, error: "Instagram feed videos max is 60 min." };
      if (fileSize && fileSize > 4 * 1024 * 1024 * 1024)
        return { valid: false, error: "Instagram file limit is 4 GB." };
      return { valid: true };

    case "facebook":
      if (postType === "reel" && duration > 90)
        return { valid: false, error: "Facebook Reels max is 90s." };
      if (postType === "reel" && !isVerticalOrSquare)
        return {
          valid: false,
          error: "Facebook Reels require vertical or square video.",
        };
      if (duration > 14400)
        return { valid: false, error: "Facebook feed videos max is 4 hours." };
      return { valid: true };

    case "twitter":
    case "x":
      if (duration > 14400)
        return {
          valid: false,
          error: "X maximum is 4 hours (Premium Plus only).",
        };
      if (fileSize && fileSize > 16 * 1024 * 1024 * 1024)
        return { valid: false, error: "X Premium Plus file limit is 16 GB." };
      return { valid: true };

    case "linkedin":
      if (duration < 3)
        return { valid: false, error: "LinkedIn video minimum is 3 seconds." };
      if (duration > 600)
        return {
          valid: false,
          error: "LinkedIn native video max is 10 min (600s). Please trim.",
        };
      if (fileSize && fileSize > 5 * 1024 * 1024 * 1024)
        return { valid: false, error: "LinkedIn file limit is 5 GB." };
      return { valid: true };

    default:
      return { valid: true };
  }
}
