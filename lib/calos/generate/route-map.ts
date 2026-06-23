import type { CalosService } from "@/schemas/calos-deliverable";

// format -> which service generates it. ThinkForge writes copy, Clickatron makes graphics,
// Editron makes video. Default to ThinkForge — every post needs copy at minimum.
const FORMAT_SERVICE: Record<string, CalosService> = {
  text: "thinkforge",
  thread: "thinkforge",
  image: "clickatron",
  carousel: "clickatron",
  story: "clickatron",
  reel: "editron",
  short_video: "editron",
  long_video: "editron",
  video: "editron",
};

export function serviceForFormat(format: string): CalosService {
  return FORMAT_SERVICE[format.toLowerCase()] ?? "thinkforge";
}
