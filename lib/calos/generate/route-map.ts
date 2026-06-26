import type { CalosService } from "@/schemas/calos-deliverable";

// A video card's deliverable is a SCRIPT (written by ThinkForge); the user then drives it into
// Editron (AI edit) or shoots/uploads their own footage. CalOS does NOT render video — Editron has
// no headless render entry point — so video formats route to ThinkForge, not "editron".
// Single source of truth: drives both serviceForFormat and isVideoFormat so they can't drift.
export const VIDEO_FORMATS = ["reel", "short_video", "long_video", "video"] as const;

// format -> which service generates it. ThinkForge writes copy + scripts, Clickatron makes graphics.
// Default to ThinkForge — every post needs copy at minimum.
const FORMAT_SERVICE: Record<string, CalosService> = {
  text: "thinkforge",
  thread: "thinkforge",
  image: "clickatron",
  carousel: "clickatron",
  story: "clickatron",
  ...Object.fromEntries(VIDEO_FORMATS.map((f) => [f, "thinkforge" as CalosService])),
};

/** Video formats produce a script (ThinkForge ScriptWriter) rather than post copy. */
export function isVideoFormat(format: string): boolean {
  return (VIDEO_FORMATS as readonly string[]).includes(format.toLowerCase());
}

export function serviceForFormat(format: string): CalosService {
  return FORMAT_SERVICE[format.toLowerCase()] ?? "thinkforge";
}
