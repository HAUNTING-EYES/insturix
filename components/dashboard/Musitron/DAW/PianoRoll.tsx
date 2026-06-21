"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { useDAW } from "./DAWContext";
import type { MIDIRegion } from "@/lib/musitron/daw-types";
import { createMIDINote, SYNTH_PRESETS } from "@/lib/musitron/daw-types";

const NOTE_HEIGHT = 12;
const BEAT_WIDTH = 40;
const TOTAL_KEYS = 88;
const LOWEST_MIDI = 21;
const KEY_WIDTH = 48;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function noteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

interface PianoRollProps {
  trackId: string;
  region: MIDIRegion;
}

export default function PianoRoll({ trackId, region }: PianoRollProps) {
  const { state, dispatch } = useDAW();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    noteId: string;
    mode: "move" | "resize";
    origPitch: number;
    origStartBeat: number;
    origDuration: number;
    startX: number;
    startY: number;
  } | null>(null);

  const track = state.project?.tracks.find((t) => t.id === trackId);
  const bpm = state.project?.bpm ?? 120;
  const totalBeats = Math.max(16, Math.ceil(region.duration / (60 / bpm)));

  const gridW = totalBeats * BEAT_WIDTH;
  const gridH = TOTAL_KEYS * NOTE_HEIGHT;
  const canvasW = KEY_WIDTH + gridW;
  const canvasH = gridH;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#0E0E0D";
    ctx.fillRect(0, 0, canvasW, canvasH);

    for (let i = 0; i < TOTAL_KEYS; i++) {
      const midi = LOWEST_MIDI + TOTAL_KEYS - 1 - i;
      const y = i * NOTE_HEIGHT;
      const black = isBlackKey(midi);

      ctx.fillStyle = black ? "#0B0B0A" : "#131312";
      ctx.fillRect(KEY_WIDTH, y, gridW, NOTE_HEIGHT);

      ctx.fillStyle = black ? "#1B1A18" : "#ECE9E1";
      ctx.fillRect(0, y, KEY_WIDTH, NOTE_HEIGHT);

      ctx.strokeStyle = "#1C1B19";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(KEY_WIDTH, y + NOTE_HEIGHT);
      ctx.lineTo(canvasW, y + NOTE_HEIGHT);
      ctx.stroke();

      if (midi % 12 === 0) {
        ctx.fillStyle = black ? "#B5B2A8" : "#3A3935";
        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.textBaseline = "middle";
        ctx.fillText(noteName(midi), 4, y + NOTE_HEIGHT / 2);
      }
    }

    for (let b = 0; b <= totalBeats; b++) {
      const x = KEY_WIDTH + b * BEAT_WIDTH;
      ctx.strokeStyle = b % 4 === 0 ? "#3A3935" : "#1C1B19";
      ctx.lineWidth = b % 4 === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasH);
      ctx.stroke();
    }

    for (const note of region.notes) {
      const row = LOWEST_MIDI + TOTAL_KEYS - 1 - note.pitch;
      if (row < 0 || row >= TOTAL_KEYS) continue;
      const x = KEY_WIDTH + note.startBeat * BEAT_WIDTH;
      const y = row * NOTE_HEIGHT;
      const w = note.durationBeats * BEAT_WIDTH;

      const trackColor = track?.color ?? "#D4A652";
      const alpha = Math.round((note.velocity / 127) * 200 + 55);
      ctx.fillStyle = trackColor + alpha.toString(16).padStart(2, "0");
      ctx.fillRect(x + 1, y + 1, w - 2, NOTE_HEIGHT - 2);

      ctx.strokeStyle = trackColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, NOTE_HEIGHT - 1);

      ctx.fillStyle = "#282724";
      ctx.fillRect(x + w - 5, y + 1, 4, NOTE_HEIGHT - 2);
    }
  }, [region.notes, canvasW, canvasH, totalBeats, track?.color]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getGridPos = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const beat = Math.max(0, (x - KEY_WIDTH) / BEAT_WIDTH);
    const row = Math.floor(y / NOTE_HEIGHT);
    const pitch = LOWEST_MIDI + TOTAL_KEYS - 1 - row;
    return { beat, pitch, x, y };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getGridPos(e);
    if (!pos || pos.pitch < LOWEST_MIDI || pos.pitch >= LOWEST_MIDI + TOTAL_KEYS) return;
    if (pos.beat < 0) return;

    const hitNote = region.notes.find((n) => {
      if (n.pitch !== pos.pitch) return false;
      const nEnd = n.startBeat + n.durationBeats;
      return pos.beat >= n.startBeat && pos.beat <= nEnd;
    });

    if (hitNote) {
      const nEnd = hitNote.startBeat + hitNote.durationBeats;
      const resizeZone = pos.beat > nEnd - 0.3;
      const ds = {
        noteId: hitNote.id,
        mode: resizeZone ? "resize" as const : "move" as const,
        origPitch: hitNote.pitch,
        origStartBeat: hitNote.startBeat,
        origDuration: hitNote.durationBeats,
        startX: pos.x,
        startY: pos.y,
      };
      setDragState(ds);

      const onMove = (me: MouseEvent) => {
        const mpos = getGridPos(me);
        if (!mpos) return;
        if (ds.mode === "move") {
          const dx = (mpos.x - ds.startX) / BEAT_WIDTH;
          const dy = Math.round((ds.startY - mpos.y) / NOTE_HEIGHT);
          const newBeat = Math.max(0, Math.round((ds.origStartBeat + dx) * 4) / 4);
          const newPitch = Math.max(LOWEST_MIDI, Math.min(LOWEST_MIDI + TOTAL_KEYS - 1, ds.origPitch + dy));
          dispatch({ type: "MOVE_MIDI_NOTE", trackId, regionId: region.id, noteId: ds.noteId, pitch: newPitch, startBeat: newBeat });
        } else {
          const dx = (mpos.x - ds.startX) / BEAT_WIDTH;
          const newDur = Math.max(0.25, Math.round((ds.origDuration + dx) * 4) / 4);
          dispatch({ type: "RESIZE_MIDI_NOTE", trackId, regionId: region.id, noteId: ds.noteId, durationBeats: newDur });
        }
      };
      const onUp = () => {
        setDragState(null);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    } else {
      const snappedBeat = Math.floor(pos.beat * 4) / 4;
      const note = createMIDINote(pos.pitch, snappedBeat, 1);
      dispatch({ type: "ADD_MIDI_NOTE", trackId, regionId: region.id, note });
    }
  }, [getGridPos, region.notes, region.id, trackId, dispatch]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getGridPos(e);
    if (!pos) return;
    const hitNote = region.notes.find((n) => {
      if (n.pitch !== pos.pitch) return false;
      return pos.beat >= n.startBeat && pos.beat <= n.startBeat + n.durationBeats;
    });
    if (hitNote) {
      dispatch({ type: "REMOVE_MIDI_NOTE", trackId, regionId: region.id, noteId: hitNote.id });
    }
  }, [getGridPos, region.notes, region.id, trackId, dispatch]);

  return (
    <div style={wrapperStyle}>
      {/* Synth patch selector */}
      <div style={toolbarStyle}>
        <span style={toolbarLabelStyle}>Patch</span>
        <select
          value={track?.synthPatch.id ?? "default"}
          onChange={(e) => {
            const preset = SYNTH_PRESETS.find((p) => p.id === e.target.value);
            if (preset) dispatch({ type: "SET_SYNTH_PATCH", trackId, patch: preset });
          }}
          style={selectStyle}
        >
          {SYNTH_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span style={{ ...toolbarLabelStyle, marginLeft: 12 }}>
          {region.notes.length} note{region.notes.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Piano roll grid */}
      <div ref={containerRef} style={scrollContainerStyle}>
        <canvas
          ref={canvasRef}
          style={{ width: canvasW, height: canvasH, display: "block", cursor: dragState ? "grabbing" : "crosshair" }}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
        />
      </div>
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "#0B0B0A",
  border: "1px solid #1C1B19",
  borderRadius: 4,
  overflow: "hidden",
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  background: "#0E0E0D",
  borderBottom: "1px solid #1C1B19",
};

const toolbarLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
  color: "#7A776E",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const selectStyle: React.CSSProperties = {
  background: "#1B1A18",
  border: "1px solid #282724",
  borderRadius: 3,
  color: "#ECE9E1",
  fontSize: 11,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  padding: "3px 6px",
  outline: "none",
  cursor: "pointer",
};

const scrollContainerStyle: React.CSSProperties = {
  overflow: "auto",
  maxHeight: 400,
  position: "relative",
};
