"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export interface NowPlayingTrack {
  id: string;
  title: string;
  style: string;
  model: string;
  gradient: string;
}

export interface NowPlayingBarProps {
  track: NowPlayingTrack | null;
  audioUrl: string | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDownload: () => void;
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function NowPlayingBar({
  track,
  audioUrl,
  isPlaying,
  onTogglePlay,
  onPrev,
  onNext,
  onDownload,
}: NowPlayingBarProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [waveHeights, setWaveHeights] = useState<number[]>(() =>
    Array.from({ length: 100 }, () => Math.random() * 20 + 4)
  );
  const waveFrameRef = useRef<number | null>(null);

  // Sync play/pause with parent state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (isPlaying) {
      audio.play().catch(() => {
        /* user interaction required, parent handles */
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, audioUrl]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => {
      setCurrentTime(0);
      // Parent should handle next track or stop
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

  // Volume sync
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Waveform animation
  useEffect(() => {
    if (!isPlaying) {
      if (waveFrameRef.current) cancelAnimationFrame(waveFrameRef.current);
      waveFrameRef.current = null;
      return;
    }
    let last = 0;
    const animate = (t: number) => {
      if (t - last > 100) {
        last = t;
        setWaveHeights(
          Array.from({ length: 100 }, () => Math.random() * 24 + 4)
        );
      }
      waveFrameRef.current = requestAnimationFrame(animate);
    };
    waveFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (waveFrameRef.current) cancelAnimationFrame(waveFrameRef.current);
    };
  }, [isPlaying]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = pct * duration;
      setCurrentTime(pct * duration);
    },
    [duration]
  );

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!track) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#0F0F0E",
          borderTop: "1px solid #1C1B19",
          zIndex: 100,
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Waveform background */}
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            right: 0,
            height: 28,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 1,
            pointerEvents: "none",
            overflow: "hidden",
            opacity: 0.12,
          }}
        >
          {waveHeights.map((h, i) => (
            <div
              key={i}
              style={{
                width: 3,
                background: "#D4A652",
                borderRadius: 1,
                height: h,
                transition: "height .1s",
              }}
            />
          ))}
        </div>

        {/* Inner layout */}
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "260px 1fr 140px",
            alignItems: "center",
            padding: "10px 32px",
            gap: 24,
          }}
        >
          {/* Left: Track info */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 6,
                flexShrink: 0,
                background: track.gradient,
              }}
            />
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#ECE9E1",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 180,
                }}
              >
                {track.title}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#5F5E5A",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {track.style} &middot; {track.model}
              </div>
            </div>
          </div>

          {/* Center: Controls + Progress */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <button
                type="button"
                onClick={onPrev}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "1px solid #282724",
                  background: "transparent",
                  color: "#ECE9E1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 12,
                  transition: "all .2s cubic-bezier(.16,1,.3,1)",
                }}
              >
                &#9664;&#9664;
              </button>
              <button
                type="button"
                onClick={onTogglePlay}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: "none",
                  background: "#D4A652",
                  color: "#0B0B0A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 15,
                  transition: "all .2s cubic-bezier(.16,1,.3,1)",
                }}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button
                type="button"
                onClick={onNext}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "1px solid #282724",
                  background: "transparent",
                  color: "#ECE9E1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 12,
                  transition: "all .2s cubic-bezier(.16,1,.3,1)",
                }}
              >
                &#9654;&#9654;
              </button>
            </div>

            {/* Progress */}
            <div
              style={{
                width: "100%",
                maxWidth: 400,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "#5F5E5A",
                  fontFamily: "'JetBrains Mono', monospace",
                  minWidth: 32,
                }}
              >
                {formatTime(currentTime)}
              </span>
              <div
                onClick={handleSeek}
                style={{
                  flex: 1,
                  height: 3,
                  background: "#1B1A18",
                  borderRadius: 2,
                  position: "relative",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "#D4A652",
                    borderRadius: 2,
                    width: `${progressPct}%`,
                    transition: "width .2s",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: "#5F5E5A",
                  fontFamily: "'JetBrains Mono', monospace",
                  minWidth: 32,
                }}
              >
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Right: Volume + Download */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  fontSize: 14,
                  color: "#7A776E",
                  cursor: "pointer",
                }}
                onClick={() => setVolume((v) => (v > 0 ? 0 : 0.7))}
              >
                {volume === 0 ? "🔇" : "🔊"}
              </span>
              <div style={{ width: 72, height: 3, background: "#1B1A18", borderRadius: 2, position: "relative" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${volume * 100}%`,
                    background: "#7A776E",
                    borderRadius: 2,
                    cursor: "pointer",
                  }}
                  onClick={(e) => {
                    const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    setVolume(pct);
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onDownload}
              title="Download"
              style={{
                width: 34,
                height: 34,
                borderRadius: 6,
                border: "1px solid #1C1B19",
                background: "transparent",
                color: "#7A776E",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 14,
                transition: "all .2s cubic-bezier(.16,1,.3,1)",
              }}
            >
              &#8595;
            </button>
          </div>
        </div>
      </div>

      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          crossOrigin="anonymous"
          preload="metadata"
        />
      )}
    </>
  );
}
