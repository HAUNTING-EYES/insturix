"use client";

import { useRef, useCallback } from "react";
import type { DAWTrack } from "@/lib/musitron/daw-types";
import { useDAW, snapToGrid } from "./DAWContext";
import WaveformCanvas from "./WaveformCanvas";
import AutomationLaneCanvas from "./AutomationLaneCanvas";

const HEADER_W = 180;
const EDGE_HIT = 6;
const AUTOMATION_LANE_H = 60;

interface TrackLaneProps {
  track: DAWTrack;
  zoom: number;
  isSelected: boolean;
  timelineWidth: number;
}

type DragMode = "move" | "trim-left" | "trim-right";

export default function TrackLane({ track, zoom, isSelected, timelineWidth }: TrackLaneProps) {
  const { state, dispatch, selectTrack, toggleMute, toggleSolo, removeTrack } = useDAW();
  const canRemove = (state.project?.tracks.length ?? 0) > 1;
  const dragRef = useRef<{
    mode: DragMode;
    regionId: string;
    startX: number;
    origStartTime: number;
    origSourceOffset: number;
    origDuration: number;
  } | null>(null);

  const getDragMode = useCallback((e: React.MouseEvent, regionLeft: number, regionWidth: number): DragMode => {
    const relX = e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left;
    const posInRegion = relX - regionLeft;
    if (posInRegion <= EDGE_HIT) return "trim-left";
    if (posInRegion >= regionWidth - EDGE_HIT) return "trim-right";
    return "move";
  }, []);

  const getCursorForPosition = useCallback((e: React.MouseEvent, regionLeft: number, regionWidth: number): string => {
    const relX = e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left;
    const posInRegion = relX - regionLeft;
    if (posInRegion <= EDGE_HIT || posInRegion >= regionWidth - EDGE_HIT) return "ew-resize";
    return "grab";
  }, []);

  const handleRegionMouseDown = useCallback((
    e: React.MouseEvent,
    regionId: string,
    regionLeft: number,
    regionWidth: number,
    origStartTime: number,
    origSourceOffset: number,
    origDuration: number,
    origSourceDuration: number,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    dispatch({ type: "SELECT_REGION", regionId });

    const mode = getDragMode(e, regionLeft, regionWidth);
    dragRef.current = {
      mode,
      regionId,
      startX: e.clientX,
      origStartTime,
      origSourceOffset,
      origDuration,
    };

    const onMove = (me: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = me.clientX - d.startX;
      const dt = dx / zoom;

      if (d.mode === "move") {
        let newStart = Math.max(0, d.origStartTime + dt);
        const bpm = state.project?.bpm ?? 120;
        if (state.snapEnabled && bpm > 0) newStart = snapToGrid(newStart, bpm);
        dispatch({
          type: "MOVE_REGION",
          trackId: track.id,
          regionId: d.regionId,
          startTime: newStart,
        });
      } else if (d.mode === "trim-left") {
        const maxTrim = d.origDuration - 0.01;
        // Also prevent startTime from going negative
        const minDt = Math.max(-d.origSourceOffset, -d.origStartTime);
        const clampedDt = Math.max(minDt, Math.min(maxTrim, dt));
        dispatch({
          type: "TRIM_REGION",
          trackId: track.id,
          regionId: d.regionId,
          startTime: d.origStartTime + clampedDt,
          sourceOffset: d.origSourceOffset + clampedDt,
          duration: d.origDuration - clampedDt,
        });
      } else {
        // Clamp: duration must stay within [0.01, remaining source audio]
        const maxDur = origSourceDuration - d.origSourceOffset;
        const newDur = Math.min(maxDur, Math.max(0.01, d.origDuration + dt));
        dispatch({
          type: "TRIM_REGION",
          trackId: track.id,
          regionId: d.regionId,
          startTime: d.origStartTime,
          sourceOffset: d.origSourceOffset,
          duration: newDur,
        });
      }
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [zoom, track.id, dispatch, getDragMode, state.snapEnabled, state.project?.bpm]);

  const gainLane = track.automationLanes.find((l) => l.param === "gain");
  const visibleLane = track.automationLanes.find((l) => l.visible);

  const handleAutomationToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!gainLane) {
      dispatch({ type: "ADD_AUTOMATION_LANE", trackId: track.id, param: "gain" });
    } else {
      dispatch({ type: "TOGGLE_AUTOMATION_LANE", trackId: track.id, laneId: gainLane.id });
    }
  }, [gainLane, track.id, dispatch]);

  return (
    <div
      style={{ borderBottom: "1px solid #1C1B19" }}
      onClick={() => selectTrack(track.id)}
    >
      <div
        style={{
          display: "flex",
          height: track.height,
          background: isSelected ? "rgba(212,166,82,0.04)" : "transparent",
        }}
      >
      {/* Track header */}
      <div
        style={{
          width: HEADER_W,
          minWidth: HEADER_W,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 8px",
          borderRight: "1px solid #1C1B19",
          position: "sticky",
          left: 0,
          zIndex: 2,
          background: isSelected ? "#141413" : "#0E0E0D",
        }}
      >
        <div style={{ width: 4, height: 28, borderRadius: 2, background: track.color, flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            fontSize: 11,
            color: "#ECE9E1",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {track.name}
        </span>
        <MixerBtn label="M" active={track.mixer.mute} onClick={(e) => { e.stopPropagation(); toggleMute(track.id); }} color="#E85D75" />
        <MixerBtn label="S" active={track.mixer.solo} onClick={(e) => { e.stopPropagation(); toggleSolo(track.id); }} color="#D4A652" />
        <MixerBtn label="A" active={!!visibleLane} onClick={handleAutomationToggle} color="#4CAF50" />
        {canRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); removeTrack(track.id); }}
            title="Remove track"
            style={{
              width: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              borderRadius: 2,
              color: "#5F5E5A",
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Regions area */}
      <div style={{ position: "relative", flex: 1, minWidth: timelineWidth }}>
        {track.regions.map((region) => {
          const left = region.startTime * zoom;
          const width = Math.max(region.duration * zoom, 4);
          const dimmed = track.mixer.mute || !!region.muted;
          const selected = state.selectedRegionId === region.id;

          return (
            <div
              key={region.id}
              title={region.name}
              onMouseDown={(e) =>
                handleRegionMouseDown(e, region.id, left, width, region.startTime, region.sourceOffset, region.duration, region.sourceDuration)
              }
              onMouseMove={(e) => {
                if (!dragRef.current) {
                  (e.currentTarget as HTMLElement).style.cursor = getCursorForPosition(
                    e,
                    left,
                    width,
                  );
                }
              }}
              style={{
                position: "absolute",
                top: 6,
                bottom: 6,
                left,
                width,
                background: dimmed
                  ? `${track.color}15`
                  : `${track.color}30`,
                border: `1px solid ${selected ? "#D4A652" : dimmed ? `${track.color}40` : `${track.color}80`}`,
                borderRadius: 4,
                overflow: "hidden",
                userSelect: "none",
              }}
            >
              <div
                style={{
                  padding: "2px 6px",
                  fontSize: 9,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  color: dimmed ? "#5F5E5A" : "#ECE9E1",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  pointerEvents: "none",
                }}
              >
                {region.name}
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 18,
                  left: 2,
                  right: 2,
                  bottom: 2,
                  pointerEvents: "none",
                }}
              >
                <WaveformCanvas
                  sourceUrl={region.sourceUrl}
                  color={track.color}
                  dimmed={dimmed}
                  width={Math.max(width - 4, 1)}
                  height={Math.max(track.height - 26, 10)}
                  sourceOffset={region.sourceOffset}
                  sourceDuration={region.sourceDuration}
                />
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {visibleLane && (
        <div
          style={{
            display: "flex",
            height: AUTOMATION_LANE_H,
            borderTop: "1px solid #1C1B19",
            background: isSelected ? "rgba(212,166,82,0.04)" : "transparent",
          }}
        >
          <div
            style={{
              width: HEADER_W,
              minWidth: HEADER_W,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 8px",
              borderRight: "1px solid #1C1B19",
              position: "sticky",
              left: 0,
              zIndex: 2,
              background: isSelected ? "#141413" : "#0E0E0D",
            }}
          >
            <div style={{ width: 4, height: 20, borderRadius: 2, background: "#4CAF50", flexShrink: 0 }} />
            <span
              style={{
                fontSize: 9,
                color: "#7A776E",
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
            >
              {visibleLane.param}
            </span>
          </div>
          <div style={{ position: "relative", flex: 1, minWidth: timelineWidth }}>
            <AutomationLaneCanvas
              lane={visibleLane}
              trackId={track.id}
              zoom={zoom}
              width={timelineWidth}
              height={AUTOMATION_LANE_H}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MixerBtn({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 20,
        height: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? `${color}25` : "transparent",
        border: `1px solid ${active ? color : "#1C1B19"}`,
        borderRadius: 3,
        color: active ? color : "#5F5E5A",
        cursor: "pointer",
        fontSize: 9,
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  );
}
