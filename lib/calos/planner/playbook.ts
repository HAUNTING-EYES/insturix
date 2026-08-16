// Product-supported platform formats. This is an execution allowlist, not a list of
// every format a platform offers: each entry must have a canonical writer contract.
export const PLATFORM_FORMATS: Record<string, string[]> = {
  youtube: ["long_video", "short_video"],
  tiktok: ["short_video"],
  instagram: ["reel", "carousel", "image"],
  linkedin: ["text", "carousel", "image", "video"],
  twitter: ["text", "image", "video"],
  facebook: ["text", "image", "video", "carousel"],
  generic: ["text", "image", "video"],
};

export function formatsFor(platform: string): string[] {
  return PLATFORM_FORMATS[platform.toLowerCase()] ?? PLATFORM_FORMATS.generic;
}
