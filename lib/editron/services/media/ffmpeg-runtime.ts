import { existsSync } from "fs";
import { createRequire } from "module";
import path from "path";

let cachedFFmpegPath: string | null = null;

export function getFFmpegPath(): string {
  if (typeof window !== "undefined") {
    throw new Error("FFmpeg can only be used on the server");
  }

  if (cachedFFmpegPath) return cachedFFmpegPath;

  const require = createRequire(import.meta.url);
  const attemptedPaths: string[] = [];
  const configuredPath = process.env.FFMPEG_PATH?.trim();
  if (configuredPath) {
    const absolutePath = path.resolve(configuredPath);
    attemptedPaths.push(absolutePath);
    if (existsSync(absolutePath)) {
      cachedFFmpegPath = absolutePath;
      return cachedFFmpegPath;
    }
  }

  // Resolve the production package directly because the generic installer
  // discovers optional platform packages in a way Next tracing cannot infer.
  if (process.platform === "linux" && process.arch === "x64") {
    try {
      const packageJsonPath = require.resolve("@ffmpeg-installer/linux-x64/package.json");
      const linuxBinaryPath = path.join(path.dirname(packageJsonPath), "ffmpeg");
      attemptedPaths.push(linuxBinaryPath);
      if (existsSync(linuxBinaryPath)) {
        cachedFFmpegPath = linuxBinaryPath;
        return cachedFFmpegPath;
      }
    } catch {
      attemptedPaths.push("@ffmpeg-installer/linux-x64:unresolvable");
    }
  }

  try {
    const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg") as { path?: unknown };
    if (typeof ffmpegInstaller.path === "string") {
      attemptedPaths.push(ffmpegInstaller.path);
      if (existsSync(ffmpegInstaller.path)) {
        cachedFFmpegPath = ffmpegInstaller.path;
        return cachedFFmpegPath;
      }
    }
  } catch (error) {
    attemptedPaths.push(`@ffmpeg-installer/ffmpeg:${error instanceof Error ? error.message : String(error)}`);
  }

  throw new Error(`FFmpeg executable is unavailable. Checked: ${attemptedPaths.join(", ") || "no candidates"}`);
}
