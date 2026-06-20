"use client";

import { useRef, useEffect } from "react";
import { AudioEngine } from "@/lib/musitron/audio-engine";
import { SynthEngine } from "@/lib/musitron/synth-engine";
import { useDAW } from "./DAWContext";
import { getTrackAutomationValues } from "@/lib/musitron/automation-utils";

export function useAudioEngine(): React.RefObject<AudioEngine | null> {
  const { state, positionRef } = useDAW();
  const engineRef = useRef<AudioEngine | null>(null);
  const synthsRef = useRef<Map<string, SynthEngine>>(new Map());

  useEffect(() => {
    engineRef.current = new AudioEngine();
    return () => {
      for (const synth of synthsRef.current.values()) {
        synth.disconnect();
      }
      synthsRef.current.clear();
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !state.project) return;

    let cancelled = false;

    engine.init().then(() => {
      if (cancelled) return;

      const projectTrackIds = new Set(state.project!.tracks.map((t) => t.id));
      engine.pruneRemovedTracks(projectTrackIds);

      for (const track of state.project!.tracks) {
        engine.ensureTrack(track.id);

        const hasGainAuto = track.automationLanes.some((l) => l.param === "gain" && l.points.length > 0);
        const hasPanAuto = track.automationLanes.some((l) => l.param === "pan" && l.points.length > 0);

        if (!hasGainAuto) engine.setTrackGain(track.id, track.mixer.gain);
        if (!hasPanAuto) engine.setTrackPan(track.id, track.mixer.pan);

        engine.setTrackMute(track.id, track.mixer.mute);
        engine.setTrackSolo(track.id, track.mixer.solo);

        if (!state.transport.playing) {
          const auto = getTrackAutomationValues(track, state.transport.position);
          if (auto.gain !== null) engine.setTrackGain(track.id, auto.gain);
          if (auto.pan !== null) engine.setTrackPan(track.id, auto.pan);
        }
      }

      engine.setMasterGain(state.project!.masterBus.gain);

      for (const track of state.project!.tracks) {
        engine.updateTrackEffects(track.id, track.effects);
      }

      const ctx = engine.getContext();
      if (ctx) {
        const activeMidiIds = new Set<string>();
        for (const track of state.project!.tracks) {
          if (track.type !== "midi") continue;
          activeMidiIds.add(track.id);
          let synth = synthsRef.current.get(track.id);
          if (!synth) {
            synth = new SynthEngine();
            const nodes = engine.getTrackInput(track.id);
            if (nodes) synth.connect(ctx, nodes);
            synthsRef.current.set(track.id, synth);
          }
          synth.setPatch(track.synthPatch);
        }
        for (const [id, synth] of synthsRef.current) {
          if (!activeMidiIds.has(id)) {
            synth.disconnect();
            synthsRef.current.delete(id);
          }
        }
      }
    });

    return () => { cancelled = true; };
  }, [state.project]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !state.project) return;

    if (state.transport.playing) {
      engine.schedulePlayback(state.project.tracks, state.transport.position);
      const bpm = state.project.bpm ?? 120;
      for (const track of state.project.tracks) {
        if (track.type !== "midi") continue;
        const synth = synthsRef.current.get(track.id);
        if (!synth) continue;
        for (const region of track.midiRegions) {
          if (region.muted) continue;
          synth.scheduleMIDI(region.notes, bpm, region.startTime, state.transport.position);
        }
      }
    } else {
      engine.stopPlayback();
      for (const synth of synthsRef.current.values()) {
        synth.stopAll();
      }
    }
  }, [state.transport.playing, state.transport.seekVersion]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !state.project || !state.transport.playing) return;

    let raf: number;
    let lastPos = positionRef.current;
    const tick = () => {
      const pos = positionRef.current;
      if (pos < lastPos - 0.1) {
        engine.stopPlayback();
        engine.schedulePlayback(state.project!.tracks, pos);
        const bpm = state.project!.bpm ?? 120;
        for (const track of state.project!.tracks) {
          if (track.type !== "midi") continue;
          const synth = synthsRef.current.get(track.id);
          if (!synth) continue;
          synth.stopAll();
          for (const region of track.midiRegions) {
            if (region.muted) continue;
            synth.scheduleMIDI(region.notes, bpm, region.startTime, pos);
          }
        }
      }
      lastPos = pos;
      for (const track of state.project!.tracks) {
        const auto = getTrackAutomationValues(track, pos);
        if (auto.gain !== null) engine.setTrackGain(track.id, auto.gain);
        if (auto.pan !== null) engine.setTrackPan(track.id, auto.pan);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.transport.playing, state.project, positionRef]);

  return engineRef;
}
