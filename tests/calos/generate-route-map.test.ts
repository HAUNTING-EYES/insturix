import { describe, expect, it } from "vitest";
import {
  isVideoFormat,
  resolveCalosGenerationRoute,
  serviceForFormat,
  UnsupportedCalosFormatError,
} from "@/lib/calos/generate/route-map";
import { formatsFor, PLATFORM_FORMATS } from "@/lib/calos/planner/playbook";

describe("CalOS generation route authority", () => {
  it.each([
    ["text", "thinkforge", "social_post"],
    ["image", "clickatron", "social_post"],
    ["carousel", "clickatron", "carousel"],
    ["reel", "thinkforge", "video_script"],
    ["short_video", "thinkforge", "video_script"],
    ["long_video", "thinkforge", "video_script"],
    ["video", "thinkforge", "video_script"],
  ] as const)("maps %s to its service and writer contract", (format, service, documentType) => {
    const route = resolveCalosGenerationRoute(format);

    expect(route).toMatchObject({ format, service, documentType });
    expect(route.contentContract.outputKind).toBe(documentType);
    expect(serviceForFormat(format.toUpperCase())).toBe(service);
    expect(isVideoFormat(format)).toBe(documentType === "video_script");
  });

  it.each(["", "newsletter", "podcast", "thread", "story", "unknown_format"])(
    "rejects unsupported format %j instead of guessing",
    (format) => {
      expect(() => resolveCalosGenerationRoute(format)).toThrow(UnsupportedCalosFormatError);
      expect(() => serviceForFormat(format)).toThrow("Unsupported CalOS content format");
      expect(isVideoFormat(format)).toBe(false);
    },
  );

  it.each(Object.keys(PLATFORM_FORMATS))(
    "only plans formats with canonical generation routes for %s",
    (platform) => {
      for (const format of formatsFor(platform)) {
        expect(() => resolveCalosGenerationRoute(format)).not.toThrow();
      }
    },
  );
});
