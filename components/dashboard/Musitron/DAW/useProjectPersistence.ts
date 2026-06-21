"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { DAWProject } from "@/lib/musitron/daw-types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface PersistenceState {
  projectId: string | null;
  saveStatus: SaveStatus;
  lastSaved: Date | null;
  loading: boolean;
}

export function useProjectPersistence(
  project: DAWProject | null,
  dispatch: (action: { type: "LOAD_PROJECT"; project: DAWProject }) => void,
  userId: string | null | undefined,
  orgId: string | null | undefined,
) {
  const [state, setState] = useState<PersistenceState>({
    projectId: null,
    saveStatus: "idle",
    lastSaved: null,
    loading: true,
  });

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectIdRef = useRef<string | null>(null);
  const lastSnapshotRef = useRef<string>("");
  const mountedRef = useRef(true);
  const savingRef = useRef(false);
  const pendingProjectRef = useRef<DAWProject | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!userId) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    let cancelled = false;

    async function loadLatest() {
      try {
        const res = await fetch("/api/services/musitron/projects?limit=1");
        if (!res.ok || cancelled) return;
        const data = await res.json();

        if (!data.success || !data.projects?.length) {
          if (!cancelled && mountedRef.current) {
            setState((s) => ({ ...s, loading: false }));
          }
          return;
        }

        const latest = data.projects[0];
        const detailRes = await fetch(`/api/services/musitron/projects/${latest._id}`);
        if (!detailRes.ok || cancelled) return;
        const detail = await detailRes.json();

        if (!detail.success || !detail.project || cancelled || !mountedRef.current) return;

        const loaded = detail.project as DAWProject;
        loaded._id = detail.project._id?.toString?.() ?? detail.project._id;

        projectIdRef.current = loaded._id ?? null;
        lastSnapshotRef.current = stableSnapshot(loaded);

        dispatch({ type: "LOAD_PROJECT", project: loaded });
        setState({
          projectId: loaded._id ?? null,
          saveStatus: "saved",
          lastSaved: loaded.updatedAt ? new Date(loaded.updatedAt) : null,
          loading: false,
        });
      } catch {
        if (!cancelled && mountedRef.current) {
          setState((s) => ({ ...s, loading: false }));
        }
      }
    }

    loadLatest();
    return () => { cancelled = true; };
  }, [userId, dispatch]);

  const saveProject = useCallback(async (proj: DAWProject) => {
    const snapshot = stableSnapshot(proj);
    if (snapshot === lastSnapshotRef.current) return;

    if (savingRef.current) {
      pendingProjectRef.current = proj;
      return;
    }
    savingRef.current = true;

    setState((s) => ({ ...s, saveStatus: "saving" }));

    const body: Record<string, unknown> = {
      name: proj.name,
      bpm: proj.bpm,
      timeSignature: proj.timeSignature,
      sampleRate: proj.sampleRate,
      tracks: proj.tracks,
      masterBus: proj.masterBus,
      markers: proj.markers,
      duration: proj.duration,
    };

    try {
      if (projectIdRef.current) {
        const res = await fetch(
          `/api/services/musitron/projects/${projectIdRef.current}`,
          { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
        );
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      } else {
        const res = await fetch("/api/services/musitron/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: proj.name, bpm: proj.bpm, timeSignature: proj.timeSignature, sampleRate: proj.sampleRate }),
        });
        if (!res.ok) throw new Error(`Create failed: ${res.status}`);
        const data = await res.json();
        if (data.projectId) {
          projectIdRef.current = data.projectId;
          const patchRes = await fetch(
            `/api/services/musitron/projects/${data.projectId}`,
            { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
          );
          if (!patchRes.ok) throw new Error(`Initial save failed: ${patchRes.status}`);
        }
      }

      lastSnapshotRef.current = snapshot;

      if (mountedRef.current) {
        const now = new Date();
        setState((s) => ({
          ...s,
          projectId: projectIdRef.current,
          saveStatus: "saved",
          lastSaved: now,
        }));
      }
    } catch (err) {
      console.error("[Persistence] Save error:", err);
      if (mountedRef.current) {
        setState((s) => ({ ...s, saveStatus: "error" }));
      }
    } finally {
      savingRef.current = false;
      const pending = pendingProjectRef.current;
      if (pending) {
        pendingProjectRef.current = null;
        saveProject(pending);
      }
    }
  }, []);

  const latestProjectRef = useRef<DAWProject | null>(null);
  latestProjectRef.current = project;

  useEffect(() => {
    if (!project || !userId || state.loading) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveProject(project);
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [project, userId, state.loading, saveProject]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const proj = latestProjectRef.current;
      if (proj && stableSnapshot(proj) !== lastSnapshotRef.current) {
        const body = JSON.stringify({
          name: proj.name, bpm: proj.bpm, timeSignature: proj.timeSignature,
          sampleRate: proj.sampleRate, tracks: proj.tracks, masterBus: proj.masterBus,
          markers: proj.markers, duration: proj.duration,
        });
        if (projectIdRef.current) {
          navigator.sendBeacon(
            `/api/services/musitron/projects/${projectIdRef.current}`,
            new Blob([body], { type: "application/json" }),
          );
        }
      }
    };
  }, []);

  return state;
}

function stableSnapshot(project: DAWProject): string {
  const { _id, createdAt, updatedAt, clerkUserId, orgId, ...rest } = project;
  return JSON.stringify(rest);
}
