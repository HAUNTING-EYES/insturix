"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import type { MusitronTask } from "@/app/api/services/musitron/types/shared";
import { VinylCarousel } from "./VinylCarousel";
import { NowPlayingBar } from "./NowPlayingBar";
import type { NowPlayingTrack } from "./NowPlayingBar";
import { useQuery } from "@tanstack/react-query";

type StatusFilter = "all" | "completed" | "processing" | "failed";
type SortMethod = "newest" | "oldest" | "title" | "duration";

/** Deterministic gradient from title string */
function titleToGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40) % 360;
  const h3 = (h1 + 120) % 360;
  return `linear-gradient(135deg, hsl(${h1},30%,10%), hsl(${h2},40%,20%), hsl(${h3},50%,40%))`;
}

function formatDate(dateStr: string | Date): string {
  const dt = new Date(dateStr);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Fetch signed audio URL for a completed task */
async function fetchSignedUrl(gcsUrl: string): Promise<string | null> {
  try {
    const res = await fetch("/api/services/musitron/gcs/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: gcsUrl.split("/").pop(),
        contentType: "audio/mpeg",
        gcsUrl,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}

export function JukeboxCollections() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMethod, setSortMethod] = useState<SortMethod>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Fetch all tasks (paginated, get first 50 for jukebox view)
  const { data: pageData } = useQuery({
    queryKey: ["musitron-tasks", 1, 50],
    queryFn: async () => {
      const response = await fetch("/api/services/musitron/history?page=1&limit=50");
      if (!response.ok) throw new Error("Failed to fetch Musitron tasks");
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
  });

  const allTasks: MusitronTask[] = pageData ?? [];

  // Stats
  const stats = useMemo(() => {
    const total = allTasks.length;
    const completed = allTasks.filter((t) => t.status === "completed").length;
    const inProgress = allTasks.filter(
      (t) => t.status === "processing" || t.status === "listed"
    ).length;
    return { total, completed, inProgress };
  }, [allTasks]);

  // Filtered + sorted
  const filteredTasks = useMemo(() => {
    let result = [...allTasks];

    // Status filter
    if (statusFilter !== "all") {
      if (statusFilter === "processing") {
        result = result.filter(
          (t) => t.status === "processing" || t.status === "listed"
        );
      } else {
        result = result.filter((t) => t.status === statusFilter);
      }
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.style?.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortMethod) {
      case "newest":
        result.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        break;
      case "oldest":
        result.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        break;
      case "title":
        result.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
    }

    return result;
  }, [allTasks, statusFilter, sortMethod, searchQuery]);

  // Active track for NowPlayingBar
  const activeTask = useMemo(
    () => allTasks.find((t) => t._id === activeTaskId) ?? null,
    [allTasks, activeTaskId]
  );

  const nowPlayingTrack: NowPlayingTrack | null = activeTask
    ? {
        id: activeTask._id,
        title: activeTask.title || "Untitled",
        style: activeTask.style || "",
        model: "",
        gradient: titleToGradient(activeTask.title || ""),
      }
    : null;

  // Fetch audio URL when active task changes
  useEffect(() => {
    setAudioUrl(null);
    if (!activeTask || activeTask.status !== "completed" || !activeTask.gcs_url) return;
    let cancelled = false;
    fetchSignedUrl(activeTask.gcs_url).then((url) => {
      if (!cancelled) setAudioUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTask]);

  const handleSelect = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
  }, []);

  const handlePlay = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
    setIsPlaying(true);
  }, []);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const handlePrev = useCallback(() => {
    const completedTasks = filteredTasks.filter((t) => t.status === "completed");
    const idx = completedTasks.findIndex((t) => t._id === activeTaskId);
    if (idx > 0) {
      setActiveTaskId(completedTasks[idx - 1]._id);
      setIsPlaying(true);
    }
  }, [filteredTasks, activeTaskId]);

  const handleNext = useCallback(() => {
    const completedTasks = filteredTasks.filter((t) => t.status === "completed");
    const idx = completedTasks.findIndex((t) => t._id === activeTaskId);
    if (idx >= 0 && idx < completedTasks.length - 1) {
      setActiveTaskId(completedTasks[idx + 1]._id);
      setIsPlaying(true);
    }
  }, [filteredTasks, activeTaskId]);

  const handleDownload = useCallback(() => {
    if (!audioUrl || !activeTask) return;
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `${(activeTask.title || "track").replace(/\s+/g, "_")}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [audioUrl, activeTask]);

  const filterPills: { label: string; value: StatusFilter }[] = [
    { label: "All", value: "all" },
    { label: "Completed", value: "completed" },
    { label: "In Progress", value: "processing" },
    { label: "Failed", value: "failed" },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 0 140px" }}>
      {/* Stats Bar */}
      <div
        style={{
          display: "flex",
          gap: 24,
          marginBottom: 32,
          padding: "16px 20px",
          background: "#0F0F0E",
          border: "1px solid #1C1B19",
          borderRadius: 10,
        }}
      >
        <StatItem value={stats.total} label="Tracks" />
        <div style={{ width: 1, background: "#1C1B19" }} />
        <StatItem value={stats.completed} label="Completed" />
        <div style={{ width: 1, background: "#1C1B19" }} />
        <StatItem value={stats.inProgress} label="In Progress" />
      </div>

      {/* Filter/Sort Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Search tracks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            background: "#1B1A18",
            border: "1px solid #1C1B19",
            borderRadius: 8,
            padding: "9px 14px 9px 14px",
            color: "#ECE9E1",
            fontSize: 13,
            outline: "none",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            transition: "border-color .2s",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#D4A652")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "#1C1B19")}
        />
        {filterPills.map((pill) => (
          <button
            key={pill.value}
            type="button"
            onClick={() => setStatusFilter(pill.value)}
            style={{
              padding: "7px 14px",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              background:
                statusFilter === pill.value
                  ? "rgba(212,166,82,0.06)"
                  : "#131312",
              border: `1px solid ${statusFilter === pill.value ? "#D4A652" : "#1C1B19"}`,
              borderRadius: 20,
              color: statusFilter === pill.value ? "#D4A652" : "#7A776E",
              cursor: "pointer",
              transition: "all .2s cubic-bezier(.16,1,.3,1)",
              fontFamily: "'JetBrains Mono', monospace",
              whiteSpace: "nowrap",
            }}
          >
            {pill.label}
          </button>
        ))}
        <select
          value={sortMethod}
          onChange={(e) => setSortMethod(e.target.value as SortMethod)}
          style={{
            padding: "7px 12px",
            fontSize: 11,
            background: "#131312",
            border: "1px solid #1C1B19",
            borderRadius: 8,
            color: "#B5B2A8",
            cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            outline: "none",
          }}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="title">Title A-Z</option>
        </select>
      </div>

      {/* Vinyl Carousel */}
      {filteredTasks.length > 0 && (
        <div style={{ marginBottom: 36 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              color: "#7A776E",
              marginBottom: 16,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Your Collection
          </div>
          <VinylCarousel
            tasks={filteredTasks}
            activeTaskId={activeTaskId}
            isPlaying={isPlaying}
            onSelect={handleSelect}
            onPlay={handlePlay}
          />
        </div>
      )}

      {/* Track List Table */}
      {filteredTasks.length > 0 ? (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              color: "#7A776E",
              marginBottom: 16,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            All Tracks
          </div>
          <div
            style={{
              background: "#0F0F0E",
              border: "1px solid #1C1B19",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 100px 80px 60px",
                alignItems: "center",
                gap: 12,
                padding: "10px 18px",
                borderBottom: "1px solid #1C1B19",
                fontSize: 10,
                color: "#5F5E5A",
                fontFamily: "'JetBrains Mono', monospace",
                textTransform: "uppercase",
                letterSpacing: "0.8px",
              }}
            >
              <div>#</div>
              <div>Title</div>
              <div>Date</div>
              <div style={{ textAlign: "right" }}>Duration</div>
              <div style={{ textAlign: "center" }}>Status</div>
            </div>

            {/* Rows */}
            {filteredTasks.map((task, i) => {
              const isActive = task._id === activeTaskId;
              return (
                <div
                  key={task._id}
                  onClick={() => {
                    if (task.status === "completed") {
                      handleSelect(task._id);
                      handlePlay(task._id);
                    }
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr 100px 80px 60px",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 18px",
                    borderBottom:
                      i < filteredTasks.length - 1
                        ? "1px solid #1C1B19"
                        : "none",
                    cursor:
                      task.status === "completed" ? "pointer" : "default",
                    background: isActive ? "#131312" : "transparent",
                    transition: "background .15s",
                  }}
                  className="jukebox-tl-row"
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: isActive ? "#D4A652" : "#5F5E5A",
                      fontFamily: "'JetBrains Mono', monospace",
                      textAlign: "center",
                    }}
                  >
                    {isActive ? "▶" : String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
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
                        marginTop: 1,
                      }}
                    >
                      {task.style || ""}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#5F5E5A",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {formatDate(task.createdAt)}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#7A776E",
                      fontFamily: "'JetBrains Mono', monospace",
                      textAlign: "right",
                    }}
                  >
                    --:--
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background:
                          task.status === "completed"
                            ? "#4ade80"
                            : task.status === "processing" ||
                                task.status === "listed"
                              ? "#D4A652"
                              : "#f87171",
                        animation:
                          task.status === "processing" ||
                          task.status === "listed"
                            ? "jbPulse 1.5s ease infinite"
                            : "none",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* Empty State */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 32px",
            textAlign: "center",
            border: "2px dashed #282724",
            borderRadius: 16,
            background: "#0F0F0E",
          }}
        >
          <svg
            width="56"
            height="56"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#5F5E5A"
            strokeWidth="1.5"
            style={{ marginBottom: 16 }}
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "#B5B2A8",
              marginBottom: 6,
            }}
          >
            No tracks yet
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#5F5E5A",
              maxWidth: 320,
              lineHeight: 1.5,
            }}
          >
            Create your first music track in the Recording Studio. Your
            generated tracks will appear here in your jukebox collection.
          </div>
        </div>
      )}

      {/* Now Playing Bar */}
      <NowPlayingBar
        track={nowPlayingTrack}
        audioUrl={audioUrl}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onPrev={handlePrev}
        onNext={handleNext}
        onDownload={handleDownload}
      />

      <style>{`
        .jukebox-tl-row:hover { background: #131312 !important; }
        @keyframes jbPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          color: "#D4A652",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#5F5E5A",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </div>
    </div>
  );
}
