"use client";

import { useEffect, useCallback, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useDAW } from "./DAWContext";
import { createDefaultProject } from "@/lib/musitron/daw-types";
import type { DAWProject, DAWRegion } from "@/lib/musitron/daw-types";
import { fetchSignedUrl } from "@/lib/musitron/daw-utils";
import type { MusitronTask } from "@/app/api/services/musitron/types/shared";
import TransportControls from "./TransportControls";
import MultiTrackTimeline from "./MultiTrackTimeline";
import MixerConsole from "./MixerConsole";
import ExportDialog from "./ExportDialog";
import PianoRoll from "./PianoRoll";
import { useProjectPersistence } from "./useProjectPersistence";

interface DAWWorkspaceProps {
  children: ReactNode;
  onSwitchToStudio: () => void;
}

function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = url;
    audio.onloadedmetadata = () => {
      resolve(isFinite(audio.duration) ? audio.duration : 30);
      audio.src = "";
    };
    audio.onerror = () => {
      resolve(30);
      audio.src = "";
    };
  });
}

export default function DAWWorkspace({ children, onSwitchToStudio }: DAWWorkspaceProps) {
  const { userId, orgId } = useAuth();
  const { state, dispatch, addRegionToTrack, play, pause, stop, undo, redo } = useDAW();
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const persistence = useProjectPersistence(state.project, dispatch, userId, orgId);

  useEffect(() => {
    if (!state.project && userId && !persistence.loading) {
      const project = createDefaultProject(userId, "Untitled Project", orgId || undefined);
      dispatch({ type: "LOAD_PROJECT", project: project as DAWProject });
    }
  }, [state.project, userId, orgId, dispatch, persistence.loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.code === "KeyZ" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.code === "Space") {
        e.preventDefault();
        if (state.transport.playing) pause();
        else play();
      } else if (e.code === "Home") {
        e.preventDefault();
        stop();
      } else if (e.code === "KeyS" && !e.ctrlKey && !e.metaKey) {
        if (state.selectedRegionId && state.selectedTrackId) {
          e.preventDefault();
          dispatch({
            type: "SPLIT_REGION",
            trackId: state.selectedTrackId,
            regionId: state.selectedRegionId,
            splitTime: state.transport.position,
          });
        }
      } else if (e.code === "Delete" || e.code === "Backspace") {
        if (state.selectedRegionId && state.selectedTrackId) {
          e.preventDefault();
          dispatch({
            type: "REMOVE_REGION",
            trackId: state.selectedTrackId,
            regionId: state.selectedRegionId,
          });
          dispatch({ type: "SELECT_REGION", regionId: null });
        }
      } else if (e.code === "KeyG" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({ type: "TOGGLE_SNAP" });
      } else if (e.code === "KeyL" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({ type: "TOGGLE_LOOP" });
      } else if (e.code === "KeyI" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({ type: "SET_LOOP_REGION", start: state.transport.position, end: state.transport.loopEnd });
      } else if (e.code === "KeyO" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({ type: "SET_LOOP_REGION", start: state.transport.loopStart, end: state.transport.position });
      } else if (e.code === "KeyD" && (e.ctrlKey || e.metaKey)) {
        if (state.selectedRegionId && state.selectedTrackId) {
          e.preventDefault();
          dispatch({
            type: "DUPLICATE_REGION",
            trackId: state.selectedTrackId,
            regionId: state.selectedRegionId,
          });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.transport.playing, state.transport.position, state.transport.loopStart, state.transport.loopEnd, state.selectedRegionId, state.selectedTrackId, play, pause, stop, dispatch, undo, redo]);

  const { data: tasksData } = useQuery({
    queryKey: ["musitron-tasks-daw", 1, 20],
    queryFn: async () => {
      const res = await fetch("/api/services/musitron/history?page=1&limit=20");
      if (!res.ok) throw new Error("Failed to fetch");
      const result = await res.json();
      const list = Array.isArray(result?.data) ? result.data : [];
      return list as MusitronTask[];
    },
    refetchInterval: (query) => {
      const hasInProgress = query.state.data?.some(
        (t: MusitronTask) => t.status === "processing" || t.status === "listed"
      );
      return hasInProgress ? 5000 : false;
    },
    staleTime: 5000,
  });

  const tasks = tasksData ?? [];

  const handleAddToDAW = useCallback(
    async (task: MusitronTask) => {
      if (!task.gcs_url || !state.project) return;
      setAddingTaskId(task._id);

      try {
        const signedUrl = await fetchSignedUrl(task.gcs_url);
        if (!signedUrl) return;

        const duration = await getAudioDuration(signedUrl);

        const selectedTrack =
          state.project.tracks.find((t) => t.id === state.selectedTrackId) ||
          state.project.tracks[0];
        if (!selectedTrack) return;

        const lastEnd = selectedTrack.regions.reduce(
          (max, r) => Math.max(max, r.startTime + r.duration),
          0
        );

        const region: DAWRegion = {
          id: `region-${Date.now()}`,
          name: task.title || "Generated Audio",
          sourceUrl: signedUrl,
          sourceGcsPath: task.gcs_url,
          sourceTaskId: task._id,
          startTime: lastEnd,
          duration,
          sourceOffset: 0,
          sourceDuration: duration,
          gain: 1,
          fadeIn: 0,
          fadeOut: 0,
        };

        addRegionToTrack(selectedTrack.id, region);
      } finally {
        setAddingTaskId(null);
      }
    },
    [state.project, state.selectedTrackId, addRegionToTrack]
  );

  const isTaskInDAW = useCallback(
    (taskId: string): boolean => {
      if (!state.project) return false;
      return state.project.tracks.some((t) =>
        t.regions.some((r) => r.sourceTaskId === taskId)
      );
    },
    [state.project]
  );

  return (
    <div style={rootStyle}>
      {/* Top bar */}
      <div style={topBarStyle}>
        <button onClick={onSwitchToStudio} style={backBtnStyle}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Studio
        </button>

        <button
          onClick={() => setSideCollapsed((c) => !c)}
          style={{ ...panelToggleStyle, color: sideCollapsed ? "#D4A652" : "#5F5E5A" }}
          title={sideCollapsed ? "Show panel" : "Hide panel"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>

        <span style={projectNameStyle}>
          {state.project?.name || "Untitled Project"}
        </span>
        <span style={saveIndicatorStyle}>
          {persistence.saveStatus === "saving" ? "Saving..." :
           persistence.saveStatus === "saved" ? "Saved" :
           persistence.saveStatus === "error" ? "Save failed" : ""}
        </span>

        <div style={{ flex: 1 }}>
          <TransportControls />
        </div>

        <button
          onClick={() => setShowExport(true)}
          style={exportBtnStyle}
          title="Export audio"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export
        </button>
      </div>

      {/* Main body */}
      <div style={bodyStyle}>
        {!sideCollapsed && (
          <div style={sidePanelStyle}>
            <div style={genSectionStyle}>
              <div style={sectionLabelStyle}>Generate</div>
              {children}
            </div>

            <div style={trackListStyle}>
              <div style={{ ...sectionLabelStyle, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Tracks</span>
                <button
                  onClick={() => dispatch({ type: "ADD_MIDI_TRACK" })}
                  style={addMidiBtn}
                  title="Add a MIDI instrument track"
                >
                  + MIDI
                </button>
              </div>

              {tasks.length === 0 && (
                <div style={emptyStyle}>Generate your first track above</div>
              )}

              {tasks.map((task) => (
                <TaskRow
                  key={task._id}
                  task={task}
                  inDAW={isTaskInDAW(task._id)}
                  adding={addingTaskId === task._id}
                  onAdd={handleAddToDAW}
                />
              ))}
            </div>
          </div>
        )}

        <MultiTrackTimeline />
      </div>

      {/* Piano roll for selected MIDI track */}
      {(() => {
        const midiTrack = state.project?.tracks.find(
          (t) => t.id === state.selectedTrackId && t.type === "midi"
        );
        const midiRegion = midiTrack?.midiRegions[0];
        if (!midiTrack || !midiRegion) return null;
        return (
          <div style={pianoRollPanelStyle}>
            <div style={pianoRollHeaderStyle}>
              <span style={pianoRollTitleStyle}>{midiTrack.name} — {midiRegion.name}</span>
            </div>
            <PianoRoll trackId={midiTrack.id} region={midiRegion} />
          </div>
        );
      })()}

      <MixerConsole />

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}

      <style>{`
        @keyframes dawPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

function TaskRow({
  task,
  inDAW,
  adding,
  onAdd,
}: {
  task: MusitronTask;
  inDAW: boolean;
  adding: boolean;
  onAdd: (t: MusitronTask) => void;
}) {
  const isCompleted = task.status === "completed";
  const statusColor =
    isCompleted
      ? "#4ade80"
      : task.status === "processing" || task.status === "listed"
        ? "#D4A652"
        : "#f87171";

  return (
    <div style={taskRowStyle}>
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: statusColor,
          flexShrink: 0,
          animation:
            task.status === "processing" || task.status === "listed"
              ? "dawPulse 1.5s ease infinite"
              : "none",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={taskTitleStyle}>{task.title || "Untitled"}</div>
        <div style={taskSubStyle}>
          {task.status === "processing" || task.status === "listed"
            ? "Generating..."
            : task.style || ""}
        </div>
      </div>
      {isCompleted && !inDAW && (
        <button onClick={() => onAdd(task)} disabled={adding} style={addBtnStyle(adding)}>
          {adding ? "..." : "+ DAW"}
        </button>
      )}
      {isCompleted && inDAW && <span style={addedLabelStyle}>Added</span>}
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "calc(100vh - 120px)",
  background: "#0B0B0A",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  borderBottom: "1px solid #1C1B19",
  background: "#0E0E0D",
};

const backBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  background: "transparent",
  border: "none",
  borderRight: "1px solid #1C1B19",
  color: "#7A776E",
  cursor: "pointer",
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: "0.5px",
  textTransform: "uppercase",
};

const projectNameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "#B5B2A8",
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  padding: "0 12px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 160,
};

const panelToggleStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "transparent",
  border: "none",
  borderRight: "1px solid #1C1B19",
  cursor: "pointer",
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  display: "flex",
  alignItems: "center",
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  overflow: "hidden",
};

const sidePanelStyle: React.CSSProperties = {
  width: 280,
  minWidth: 280,
  borderRight: "1px solid #1C1B19",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "#0F0F0E",
};

const genSectionStyle: React.CSSProperties = {
  padding: "16px 14px",
  borderBottom: "1px solid #1C1B19",
  overflowY: "auto",
  maxHeight: "50%",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "#7A776E",
  marginBottom: 12,
  fontFamily: "'JetBrains Mono', monospace",
};

const trackListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px 0",
};

const emptyStyle: React.CSSProperties = {
  padding: "20px 14px",
  color: "#5F5E5A",
  fontSize: 11,
  textAlign: "center",
};

const taskRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 14px",
  borderBottom: "1px solid #151514",
};

const taskTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "#ECE9E1",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const taskSubStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#5F5E5A",
  fontFamily: "'JetBrains Mono', monospace",
};

function addBtnStyle(adding: boolean): React.CSSProperties {
  return {
    padding: "3px 8px",
    fontSize: 9,
    fontWeight: 600,
    background: adding ? "#1B1A18" : "rgba(212,166,82,0.1)",
    border: "1px solid #D4A652",
    borderRadius: 4,
    color: "#D4A652",
    cursor: adding ? "wait" : "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "nowrap",
  };
}

const addedLabelStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#4ade80",
  fontFamily: "'JetBrains Mono', monospace",
};

const saveIndicatorStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#5F5E5A",
  fontFamily: "'JetBrains Mono', monospace",
  padding: "0 8px",
  whiteSpace: "nowrap",
};

const exportBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 14px",
  background: "rgba(212,166,82,0.1)",
  border: "1px solid #D4A652",
  borderRadius: 4,
  color: "#D4A652",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 600,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: "0.5px",
  textTransform: "uppercase",
  marginRight: 10,
  whiteSpace: "nowrap",
};

const addMidiBtn: React.CSSProperties = {
  padding: "2px 7px",
  fontSize: 9,
  fontWeight: 600,
  background: "rgba(212,166,82,0.08)",
  border: "1px solid #3A3935",
  borderRadius: 3,
  color: "#D4A652",
  cursor: "pointer",
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: "0.3px",
};

const pianoRollPanelStyle: React.CSSProperties = {
  borderTop: "1px solid #1C1B19",
  background: "#0B0B0A",
  maxHeight: 300,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const pianoRollHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "4px 10px",
  background: "#0E0E0D",
  borderBottom: "1px solid #1C1B19",
};

const pianoRollTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "#7A776E",
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: "0.5px",
  textTransform: "uppercase",
};
