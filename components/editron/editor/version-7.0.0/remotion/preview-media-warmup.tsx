import React from "react";

import { Overlay, OverlayType } from "../types";

const DEFAULT_LOOK_AHEAD_SECONDS = 12;
const DEFAULT_RETAIN_BEHIND_SECONDS = 2;
const DEFAULT_MAX_WARM_SOURCES = 4;

export type PreviewWarmSource = {
  kind: "audio" | "video";
  url: string;
};

type PreviewMediaCandidate = PreviewWarmSource & {
  endFrame: number;
  startFrame: number;
};

export function selectPreviewWarmSources({
  currentFrame,
  fps,
  maxSources = DEFAULT_MAX_WARM_SOURCES,
  overlays,
}: {
  currentFrame: number;
  fps: number;
  maxSources?: number;
  overlays: Overlay[];
}): PreviewWarmSource[] {
  if (!Number.isFinite(currentFrame) || !Number.isFinite(fps) || fps <= 0 || maxSources <= 0) {
    return [];
  }

  const windowStart = Math.max(0, currentFrame - DEFAULT_RETAIN_BEHIND_SECONDS * fps);
  const windowEnd = currentFrame + DEFAULT_LOOK_AHEAD_SECONDS * fps;
  const candidates: PreviewMediaCandidate[] = [];

  for (const overlay of overlays) {
    if (overlay.type !== OverlayType.VIDEO && overlay.type !== OverlayType.SOUND) {
      continue;
    }

    const url = overlay.src || overlay.content;
    const duration = Number(overlay.durationInFrames);
    if (!isWarmableUrl(url) || !Number.isFinite(duration) || duration <= 0) {
      continue;
    }

    const startFrame = Number(overlay.from);
    const endFrame = startFrame + duration;
    if (!Number.isFinite(startFrame) || endFrame <= windowStart || startFrame >= windowEnd) {
      continue;
    }

    candidates.push({
      endFrame,
      kind: overlay.type === OverlayType.VIDEO ? "video" : "audio",
      startFrame,
      url,
    });
  }

  candidates.sort((left, right) => {
    const leftActive = left.startFrame <= currentFrame && left.endFrame > currentFrame;
    const rightActive = right.startFrame <= currentFrame && right.endFrame > currentFrame;
    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1;
    }
    return left.startFrame - right.startFrame;
  });

  const selected: PreviewWarmSource[] = [];
  const seenUrls = new Set<string>();
  for (const candidate of candidates) {
    if (seenUrls.has(candidate.url)) {
      continue;
    }
    seenUrls.add(candidate.url);
    selected.push({ kind: candidate.kind, url: candidate.url });
    if (selected.length >= maxSources) {
      break;
    }
  }

  return selected;
}

export const PreviewMediaWarmup: React.FC<{
  sources: PreviewWarmSource[];
}> = ({ sources }) => {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      style={{
        height: 1,
        left: 0,
        opacity: 0,
        overflow: "hidden",
        pointerEvents: "none",
        position: "absolute",
        top: 0,
        width: 1,
      }}
    >
      {sources.map((source) =>
        source.kind === "video" ? (
          <video
            key={`${source.kind}:${source.url}`}
            muted
            playsInline
            preload="auto"
            src={source.url}
          />
        ) : (
          <audio
            key={`${source.kind}:${source.url}`}
            muted
            preload="auto"
            src={source.url}
          />
        ),
      )}
    </div>
  );
};

function isWarmableUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
