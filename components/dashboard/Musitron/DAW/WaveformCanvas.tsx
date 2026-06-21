"use client";

import { useRef, useEffect, useState } from "react";
import { extractPeaks, getCachedPeaks, type WaveformPeaks } from "@/lib/musitron/waveform-utils";

interface WaveformCanvasProps {
  sourceUrl: string;
  color: string;
  dimmed: boolean;
  width: number;
  height: number;
  sourceOffset: number;
  sourceDuration: number;
}

export default function WaveformCanvas({
  sourceUrl,
  color,
  dimmed,
  width,
  height,
  sourceOffset,
  sourceDuration,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<WaveformPeaks | null>(
    () => getCachedPeaks(sourceUrl) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (peaks || failed) return;
    let cancelled = false;

    extractPeaks(sourceUrl, 2048)
      .then((p) => { if (!cancelled) setPeaks(p); })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [sourceUrl, peaks, failed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const alpha = dimmed ? 0.25 : 0.6;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;

    const midY = height / 2;
    const amp = midY * 0.9;

    const totalPeaks = peaks.length;
    const totalDur = peaks.duration > 0 ? peaks.duration : sourceOffset + sourceDuration;
    const startFrac = totalDur > 0 ? sourceOffset / totalDur : 0;
    const endFrac = totalDur > 0 ? Math.min(1, (sourceOffset + sourceDuration) / totalDur) : 1;
    const peakStart = Math.floor(startFrac * totalPeaks);
    const peakEnd = Math.min(Math.ceil(endFrac * totalPeaks), totalPeaks);
    const peakCount = peakEnd - peakStart;

    if (peakCount <= 0) return;

    const pxPerPeak = width / peakCount;

    for (let i = 0; i < peakCount; i++) {
      const idx = peakStart + i;
      const min = peaks.peaks[idx * 2];
      const max = peaks.peaks[idx * 2 + 1];

      const x = i * pxPerPeak;
      const barW = Math.max(1, pxPerPeak - 0.5);
      const y1 = midY - max * amp;
      const y2 = midY - min * amp;
      const barH = Math.max(1, y2 - y1);

      ctx.fillRect(x, y1, barW, barH);
    }
  }, [peaks, color, dimmed, width, height, sourceOffset, sourceDuration]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
}
