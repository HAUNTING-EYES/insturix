"use client";

import { useRef, useEffect, useCallback } from "react";
import { useDAW } from "./DAWContext";
import TrackLane from "./TrackLane";

const HEADER_W = 180;
const RULER_H = 28;
const MIN_DURATION = 60;

function getTickInterval(zoom: number): { major: number; minor: number } {
  const pxPerMajor = 80;
  const raw = pxPerMajor / zoom;
  const snaps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const major = snaps.find((s) => s >= raw) ?? 300;
  const minor = major <= 1 ? 0.25 : major <= 5 ? 1 : major <= 30 ? 5 : 10;
  return { major, minor };
}

function formatRulerTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function MultiTrackTimeline() {
  const { state, positionRef, seek, addTrack, dispatch } = useDAW();
  const { project, transport, zoom, scrollX } = state;
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const rafActiveRef = useRef(false);

  const maxRegionEnd = project
    ? Math.max(
        MIN_DURATION,
        ...project.tracks.flatMap((t) => t.regions.map((r) => r.startTime + r.duration))
      )
    : MIN_DURATION;

  const timelineWidth = (maxRegionEnd + 30) * zoom;

  const animatePlayhead = useCallback(() => {
    if (!rafActiveRef.current) return;
    if (playheadRef.current) {
      const px = positionRef.current * zoom;
      playheadRef.current.style.transform = `translateX(${px}px)`;
    }
    rafRef.current = requestAnimationFrame(animatePlayhead);
  }, [positionRef, zoom]);

  useEffect(() => {
    if (transport.playing) {
      rafActiveRef.current = true;
      rafRef.current = requestAnimationFrame(animatePlayhead);
    } else {
      rafActiveRef.current = false;
      cancelAnimationFrame(rafRef.current);
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${transport.position * zoom}px)`;
      }
    }
    return () => {
      rafActiveRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [transport.playing, transport.position, zoom, animatePlayhead]);

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, x / zoom);
    seek(time);
  };

  const handleScroll = () => {
    if (containerRef.current) {
      dispatch({ type: "SET_SCROLL_X", scrollX: containerRef.current.scrollLeft });
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.85 : 1.18;
        dispatch({ type: "SET_ZOOM", zoom: zoom * delta });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, dispatch]);

  const { major, minor } = getTickInterval(zoom);

  if (!project) {
    return (
      <div style={{ padding: 24, color: "#5F5E5A", textAlign: "center", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        No project loaded
      </div>
    );
  }

  const tickCount = Math.ceil(maxRegionEnd + 30);
  const ticks: React.ReactNode[] = [];
  for (let t = 0; t <= tickCount; t += minor) {
    const x = t * zoom;
    const isMajor = Math.abs(t % major) < 0.001;
    ticks.push(
      <div key={t} style={{ position: "absolute", left: x }}>
        <div
          style={{
            width: 1,
            height: isMajor ? RULER_H - 4 : 8,
            background: isMajor ? "#3A3935" : "#2A2926",
            position: "absolute",
            bottom: 0,
          }}
        />
        {isMajor && (
          <span
            style={{
              position: "absolute",
              top: 2,
              left: 4,
              fontSize: 9,
              color: "#7A776E",
              fontFamily: "'JetBrains Mono', monospace",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {formatRulerTime(t)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        flex: 1,
        overflow: "auto",
        background: "#0B0B0A",
        position: "relative",
      }}
    >
      {/* Time ruler */}
      <div style={{ display: "flex", height: RULER_H, borderBottom: "1px solid #1C1B19", position: "sticky", top: 0, zIndex: 4, background: "#0E0E0D" }}>
        <div style={{ width: HEADER_W, minWidth: HEADER_W, borderRight: "1px solid #1C1B19", position: "sticky", left: 0, zIndex: 5, background: "#0E0E0D" }} />
        <div
          onClick={handleRulerClick}
          style={{ position: "relative", minWidth: timelineWidth, cursor: "crosshair" }}
        >
          {ticks}
        </div>
      </div>

      {/* Beat grid lines */}
      {state.snapEnabled && project.bpm > 0 && (() => {
        const beatSec = 60 / project.bpm;
        const visibleEnd = maxRegionEnd + 30;
        const lines: React.ReactNode[] = [];
        for (let b = 0; b * beatSec <= visibleEnd; b++) {
          const x = b * beatSec * zoom;
          const beatsPerBar = project.timeSignature?.[0] ?? 4;
          const isBar = b % beatsPerBar === 0;
          lines.push(
            <div
              key={`beat-${b}`}
              style={{
                position: "absolute",
                top: RULER_H,
                bottom: 0,
                left: HEADER_W + x,
                width: 1,
                background: isBar ? "#2A292620" : "#1C1B1910",
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          );
        }
        return lines;
      })()}

      {/* Loop region highlight */}
      {transport.loopEnabled && transport.loopEnd > transport.loopStart && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: HEADER_W + transport.loopStart * zoom,
            width: (transport.loopEnd - transport.loopStart) * zoom,
            background: "rgba(76, 175, 80, 0.06)",
            borderLeft: "1px solid rgba(76, 175, 80, 0.4)",
            borderRight: "1px solid rgba(76, 175, 80, 0.4)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}

      {/* Track lanes */}
      {project.tracks.map((track) => (
        <TrackLane
          key={track.id}
          track={track}
          zoom={zoom}
          isSelected={state.selectedTrackId === track.id}
          timelineWidth={timelineWidth}
        />
      ))}

      {/* Add track button */}
      <div style={{ display: "flex", height: 36, borderBottom: "1px solid #1C1B19" }}>
        <div
          style={{
            width: HEADER_W,
            minWidth: HEADER_W,
            borderRight: "1px solid #1C1B19",
            position: "sticky",
            left: 0,
            zIndex: 2,
            background: "#0E0E0D",
            display: "flex",
            alignItems: "center",
            paddingLeft: 8,
          }}
        >
          <button
            onClick={() => addTrack()}
            style={{
              background: "transparent",
              border: "1px dashed #1C1B19",
              borderRadius: 4,
              color: "#5F5E5A",
              fontSize: 10,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              padding: "4px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Add Track
          </button>
        </div>
      </div>

      {/* Playhead */}
      <div
        ref={playheadRef}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: HEADER_W,
          width: 1,
          background: "#D4A652",
          zIndex: 3,
          pointerEvents: "none",
          willChange: "transform",
          transform: `translateX(${transport.position * zoom}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: -5,
            width: 11,
            height: 8,
            background: "#D4A652",
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          }}
        />
      </div>
    </div>
  );
}
