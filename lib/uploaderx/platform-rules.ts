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
}

export interface DetectionResult {
  instagram: PlatformDetectionResult;
  youtube: PlatformDetectionResult;
  facebook: PlatformDetectionResult;
  linkedin: PlatformDetectionResult;
  x: PlatformDetectionResult;
  twitter: PlatformDetectionResult;
}

export function detectPostTypes(metadata: VideoMetadata): DetectionResult {
  const { duration, orientation } = metadata;

  // 1. YouTube Rules
  const ytShortEligible = duration <= 180 && (orientation === "vertical" || orientation === "square");
  const ytRecommended = ytShortEligible ? "short" : "video";
  const ytAvailable = ytShortEligible ? ["short", "video"] : ["video"];
  let ytReason = "";
  if (ytRecommended === "short") {
    ytReason = "Selected because the video is vertical/square and under 3 minutes.";
  } else if (duration > 180) {
    ytReason = "Selected because the video exceeds YouTube Shorts limits.";
  } else {
    ytReason = "Selected because the video is horizontal.";
  }

  // 2. Instagram Rules
  let igRecommended = "feed_video";
  if (duration > 180) {
    igRecommended = "feed_video";
  } else if (orientation === "vertical" || orientation === "square") {
    igRecommended = "reel";
  } else {
    igRecommended = "feed_video";
  }
  const igAvailable = ["reel", "feed_video"];
  let igReason = "";
  if (igRecommended === "reel") {
    igReason = "Selected because the video is vertical/square and under 3 minutes.";
  } else if (duration > 180) {
    igReason = "Selected because the video length exceeds typical short-form expectations.";
  } else {
    igReason = "Selected because the video is horizontal and better suited for a Feed Video.";
  }

  // 3. Facebook Rules
  const fbRecommended = "reel";
  const fbAvailable = ["reel", "video"];
  const fbReason = "Selected as the default format for Facebook.";

  // 4. LinkedIn Rules
  const liRecommended = "video";
  const liAvailable = ["video"];
  const liReason = "Selected because LinkedIn only supports video posts.";

  // 5. X Rules
  const xRecommended = "video";
  const xAvailable = ["video"];
  const xReason = "Selected because X only supports video posts.";

  return {
    instagram: { recommended: igRecommended, available: igAvailable, reason: igReason },
    youtube: { recommended: ytRecommended, available: ytAvailable, reason: ytReason },
    facebook: { recommended: fbRecommended, available: fbAvailable, reason: fbReason },
    linkedin: { recommended: liRecommended, available: liAvailable, reason: liReason },
    x: { recommended: xRecommended, available: xAvailable, reason: xReason },
    twitter: { recommended: xRecommended, available: xAvailable, reason: xReason },
  };
}

export function validatePostType(
  platform: string,
  postType: string,
  metadata: VideoMetadata
): { valid: boolean; error?: string } {
  const normPlatform = platform === "twitter" ? "x" : platform;

  if (normPlatform === "youtube") {
    if (postType === "short") {
      if (metadata.duration > 180) {
        return {
          valid: false,
          error: "This video is not eligible for YouTube Shorts. Please publish as a standard video.",
        };
      }
      if (metadata.orientation === "horizontal") {
        return {
          valid: false,
          error: "This video is not eligible for YouTube Shorts because it is horizontal. Please publish as a standard video.",
        };
      }
    }
  }

  const detection = detectPostTypes(metadata);
  const platKey = normPlatform as keyof typeof detection;
  const platformDetection = detection[platKey];

  if (!platformDetection) {
    return { valid: false, error: `Unsupported platform: ${platform}` };
  }

  if (!platformDetection.available.includes(postType)) {
    return { valid: false, error: `Selected format '${postType}' is not available for ${platform}.` };
  }

  return { valid: true };
}
