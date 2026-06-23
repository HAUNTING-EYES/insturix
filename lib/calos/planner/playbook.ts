// ponytail: platform format affordances — not a knowledge doc, just what each platform supports.
// The planner picks a real format per slot, and P3 routes on it later (video -> Editron,
// image/carousel -> Clickatron, text -> ThinkForge). Add pillars/strategy only if the eval shows
// the plans come out monotonous; until then the planner varies formats on its own.
export const PLATFORM_FORMATS: Record<string, string[]> = {
  youtube: ["long_video", "short_video"],
  tiktok: ["short_video"],
  instagram: ["reel", "carousel", "image", "story"],
  linkedin: ["text", "carousel", "image", "video"],
  twitter: ["text", "thread", "image", "video"],
  facebook: ["text", "image", "video", "carousel"],
  generic: ["text", "image", "video"],
};

export function formatsFor(platform: string): string[] {
  return PLATFORM_FORMATS[platform.toLowerCase()] ?? PLATFORM_FORMATS.generic;
}
