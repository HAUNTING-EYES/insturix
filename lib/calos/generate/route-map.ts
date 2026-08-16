import type { CalosService } from "@/schemas/calos-deliverable";
import {
  createThinkForgeWriterContract,
  type ThinkForgeDocumentContract,
  type ThinkForgeWriterKind,
} from "@/lib/thinkforge/schemas/document-contract";

// A video card's deliverable is a script. CalOS writes it through ThinkForge; Editron owns
// downstream video production and is not a headless CalOS writer.
export const VIDEO_FORMATS = ["reel", "short_video", "long_video", "video"] as const;

type CalosGenerationRouteDescriptor = {
  service: CalosService;
  writerKind: ThinkForgeWriterKind;
};

export interface CalosGenerationRoute extends CalosGenerationRouteDescriptor {
  format: string;
  documentType: ThinkForgeWriterKind;
  contentContract: ThinkForgeDocumentContract;
}

export class UnsupportedCalosFormatError extends Error {
  readonly code = "unsupported_calos_format";

  constructor(readonly format: string) {
    super(`Unsupported CalOS content format: ${format || "(empty)"}`);
    this.name = "UnsupportedCalosFormatError";
  }
}

// One authority for both the authoring contract and downstream service. Clickatron-owned formats
// still use ThinkForge PostWriter output for their copy and hidden visual handoff.
const FORMAT_ROUTES: Readonly<Record<string, CalosGenerationRouteDescriptor>> = {
  text: { service: "thinkforge", writerKind: "social_post" },
  image: { service: "clickatron", writerKind: "social_post" },
  carousel: { service: "clickatron", writerKind: "carousel" },
  reel: { service: "thinkforge", writerKind: "video_script" },
  short_video: { service: "thinkforge", writerKind: "video_script" },
  long_video: { service: "thinkforge", writerKind: "video_script" },
  video: { service: "thinkforge", writerKind: "video_script" },
};

/** Video formats produce a script (ThinkForge ScriptWriter) rather than post copy. */
export function isVideoFormat(format: string): boolean {
  return FORMAT_ROUTES[format.trim().toLowerCase()]?.writerKind === "video_script";
}

export function resolveCalosGenerationRoute(format: string): CalosGenerationRoute {
  const normalized = format.trim().toLowerCase();
  const descriptor = FORMAT_ROUTES[normalized];
  if (!descriptor) throw new UnsupportedCalosFormatError(normalized);

  return {
    format: normalized,
    ...descriptor,
    documentType: descriptor.writerKind,
    contentContract: createThinkForgeWriterContract(descriptor.writerKind),
  };
}

export function serviceForFormat(format: string): CalosService {
  return resolveCalosGenerationRoute(format).service;
}
