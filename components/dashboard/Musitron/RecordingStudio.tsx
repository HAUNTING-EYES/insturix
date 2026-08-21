"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MusitronTask } from "@/app/api/services/musitron/types/shared";
import { VUMeter } from "./VUMeter";
import { useQuery } from "@tanstack/react-query";
import { fetchSignedUrl } from "@/lib/musitron/daw-utils";
import { DAWProvider } from "./DAW/DAWContext";
import DAWWorkspace from "./DAW/DAWWorkspace";

interface RecordingStudioProps {
  children: React.ReactNode; // MusicGenerator form
}

/** Deterministic gradient from title string */
function titleToGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40) % 360;
  return `radial-gradient(circle, hsl(${h1},50%,35%), hsl(${h2},30%,15%))`;
}

export function RecordingStudio({ children }: RecordingStudioProps) {
  const router = useRouter();
  const [view, setView] = useState<"studio" | "daw">("studio");
  const [activeTrackIdx, setActiveTrackIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  // Fetch recent tasks for tape shelf
  const { data: tasksData } = useQuery({
    queryKey: ["musitron-tasks", 1, 10],
    queryFn: async () => {
      const response = await fetch("/api/services/musitron/history?page=1&limit=10");
      if (!response.ok) throw new Error("Failed to fetch");
      const result = await response.json();
      const list = Array.isArray(result?.data) ? result.data : [];
      return list.map((task: any) => ({
        ...task,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      })) as MusitronTask[];
    },
    refetchInterval: (query) => {
      const hasInProgress = query.state.data?.some(
        (t: MusitronTask) => t.status === "processing" || t.status === "listed"
      );
      return hasInProgress ? 5000 : false;
    },
    staleTime: 5000,
    gcTime: 1000 * 60 * 10,
    enabled: view !== "daw",
  });

  const tasks: MusitronTask[] = tasksData ?? [];
  const activeTask = tasks[activeTrackIdx] ?? null;

  // Fetch audio when active task changes
  useEffect(() => {
    setAudioUrl(null);
    setCurrentTime(0);
    setDuration(0);
    if (!activeTask || activeTask.status !== "completed" || !activeTask.gcs_url) return;
    let cancelled = false;
    fetchSignedUrl(activeTask.gcs_url).then((url) => {
      if (!cancelled) setAudioUrl(url);
    });
    return () => { cancelled = true; };
  }, [activeTask?._id, activeTask?.status, activeTask?.gcs_url]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, [audioUrl]);

  // Sync play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [isPlaying, audioUrl]);

  const togglePlay = useCallback(() => {
    if (!activeTask || activeTask.status !== "completed") return;
    setIsPlaying((p) => !p);
  }, [activeTask]);

  const selectReel = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= tasks.length) return;
      setActiveTrackIdx(idx);
      if (tasks[idx].status === "completed") {
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
    },
    [tasks]
  );

  const prevTrack = useCallback(() => {
    selectReel(Math.max(0, activeTrackIdx - 1));
  }, [activeTrackIdx, selectReel]);

  const nextTrack = useCallback(() => {
    selectReel(Math.min(tasks.length - 1, activeTrackIdx + 1));
  }, [activeTrackIdx, tasks.length, selectReel]);

  function formatTime(sec: number): string {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const vinylLabel = activeTask
    ? titleToGradient(activeTask.title || "Musitron")
    : "radial-gradient(circle, #D4A652, #8a6520)";

  if (view === "daw") {
    return (
      <DAWProvider>
        <DAWWorkspace onSwitchToStudio={() => setView("studio")}>
          {children}
        </DAWWorkspace>
      </DAWProvider>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 300px",
        gap: 0,
        minHeight: "calc(100vh - 120px)",
      }}
    >
      {/* LEFT: Mixing Console (Form) */}
      <div
        style={{
          padding: "28px 24px",
          borderRight: "1px solid #1C1B19",
          overflowY: "auto",
          background: "#0F0F0E",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              color: "#7A776E",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Mixing Console
          </div>
          <button
            type="button"
            onClick={() => setView("daw")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              background: "rgba(212,166,82,0.08)",
              border: "1px solid rgba(212,166,82,0.25)",
              borderRadius: 6,
              color: "#D4A652",
              cursor: "pointer",
              fontSize: 10,
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              transition: "all .15s",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="18" rx="2" />
              <line x1="2" y1="9" x2="22" y2="9" />
              <line x1="2" y1="15" x2="22" y2="15" />
            </svg>
            DAW
          </button>
        </div>
        {children}
      </div>

      {/* CENTER: Turntable + Player */}
      <div
        style={{
          background: "#0B0B0A",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
          position: "relative",
        }}
      >
        {/* Recording Indicator */}
        {activeTask &&
          (activeTask.status === "processing" ||
            activeTask.status === "listed") && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                background: "rgba(220, 60, 60, 0.08)",
                border: "1px solid rgba(220, 60, 60, 0.2)",
                borderRadius: 8,
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#dc3c3c",
                  animation: "studioRecPulse 1s ease infinite",
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: "#dc6c6c",
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                }}
              >
                Recording...
              </div>
            </div>
          )}

        {/* Turntable */}
        <div
          style={{
            width: 320,
            height: 320,
            position: "relative",
            marginBottom: 32,
          }}
        >
          {/* Vinyl */}
          <div
            style={{
              width: 300,
              height: 300,
              borderRadius: "50%",
              position: "absolute",
              top: 10,
              left: 10,
              background:
                "repeating-radial-gradient(circle, #111 0px, #111 2px, #161615 2px, #161615 4px)",
              border: "3px solid #222",
              boxShadow: isPlaying
                ? "0 0 80px rgba(212,166,82,.1)"
                : "0 0 60px rgba(0,0,0,.6)",
              animation: isPlaying
                ? "studioVinylSpin 3s linear infinite"
                : "none",
              transition: "box-shadow .4s",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 90,
                height: 90,
                borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                background: vinylLabel,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#0B0B0A",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                Musitron
              </span>
            </div>
          </div>

          {/* Tonearm */}
          <div
            style={{
              position: "absolute",
              top: -10,
              right: 20,
              width: 4,
              height: 140,
              background: "linear-gradient(180deg, #777, #444)",
              borderRadius: 2,
              transformOrigin: "top center",
              transform: isPlaying ? "rotate(8deg)" : "rotate(-15deg)",
              transition: "transform .6s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: -6,
                left: -3,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#555",
                border: "1px solid #777",
              }}
            />
          </div>
        </div>

        {/* Now Playing Info */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 4,
              color: "#ECE9E1",
            }}
          >
            {activeTask?.title || "No Track Selected"}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#B5B2A8",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {activeTask
              ? `${activeTask.style || "Unknown"} · ${formatTime(duration)}`
              : "Select a track from the tape shelf"}
          </div>
        </div>

        {/* Player Controls */}
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            marginTop: 20,
          }}
        >
          <button
            type="button"
            onClick={prevTrack}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "1px solid #282724",
              background: "#131312",
              color: "#ECE9E1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 16,
              transition: "all .2s cubic-bezier(.16,1,.3,1)",
            }}
          >
            &#9664;&#9664;
          </button>
          <button
            type="button"
            onClick={togglePlay}
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: "none",
              background: "#D4A652",
              color: "#0B0B0A",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 20,
              transition: "all .2s cubic-bezier(.16,1,.3,1)",
            }}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button
            type="button"
            onClick={nextTrack}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "1px solid #282724",
              background: "#131312",
              color: "#ECE9E1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 16,
              transition: "all .2s cubic-bezier(.16,1,.3,1)",
            }}
          >
            &#9654;&#9654;
          </button>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            width: 280,
            height: 3,
            background: "#1B1A18",
            borderRadius: 2,
            marginTop: 16,
            position: "relative",
            overflow: "hidden",
            cursor: "pointer",
          }}
          onClick={(e) => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(
              0,
              Math.min(1, (e.clientX - rect.left) / rect.width)
            );
            audio.currentTime = pct * duration;
          }}
        >
          <div
            style={{
              height: "100%",
              background: "#D4A652",
              borderRadius: 2,
              width: `${progressPct}%`,
              transition: "width .3s",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: 280,
            marginTop: 6,
            fontSize: 10,
            color: "#5F5E5A",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* VU Meter */}
        <VUMeter isPlaying={isPlaying} barCount={20} />
      </div>

      {/* RIGHT: Tape Shelf */}
      <div
        style={{
          background: "#0F0F0E",
          overflowY: "auto",
          padding: "28px 0",
          borderLeft: "1px solid #1C1B19",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: "#7A776E",
            marginBottom: 20,
            fontFamily: "'JetBrains Mono', monospace",
            padding: "0 24px",
          }}
        >
          Tape Shelf
        </div>

        {tasks.length === 0 && (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              color: "#5F5E5A",
              fontSize: 13,
            }}
          >
            No tracks yet. Generate your first track!
          </div>
        )}

        {tasks.map((task, i) => {
          const isActive = i === activeTrackIdx;
          const statusColor =
            task.status === "completed"
              ? "#5EC97E"
              : task.status === "processing" || task.status === "listed"
                ? "#D4A652"
                : "#D46A5C";

          return (
            <div
              key={task._id}
              onClick={() => selectReel(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                borderBottom: "1px solid #1C1B19",
                cursor: "pointer",
                background: isActive ? "#131312" : "transparent",
                borderLeft: isActive ? "2px solid #D4A652" : "2px solid transparent",
                transition: "background .2s",
                position: "relative",
              }}
              className="studio-tape-reel"
            >
              {/* Reel icon */}
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: "2px solid #282724",
                  background:
                    "radial-gradient(circle, #1B1A18 30%, #131312 70%)",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#131312",
                    border: "1px solid #282724",
                  }}
                />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "#ECE9E1",
                  }}
                >
                  {task.title || "Untitled"}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#5F5E5A",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {task.status === "processing" || task.status === "listed" ? (
                    "Generating..."
                  ) : task.status === "failed" ? (
                    // Was "Failed · Retry" — no retry exists anywhere in the
                    // product. Link to the task page, which shows the real
                    // error and suggested action.
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/musitron/task/${task._id}`); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); router.push(`/dashboard/musitron/task/${task._id}`); } }}
                      style={{ color: "#D46A5C", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
                    >
                      Failed · View details
                    </span>
                  ) : (
                    task.style || ""
                  )}
                </div>
              </div>

              {/* Status dot */}
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: statusColor,
                  animation:
                    task.status === "processing" || task.status === "listed"
                      ? "studioRecPulse 1.5s ease infinite"
                      : "none",
                }}
              />
            </div>
          );
        })}
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

      <style>{`
        @keyframes studioVinylSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes studioRecPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .studio-tape-reel:hover { background: #131312 !important; }
      `}</style>
    </div>
  );
}
