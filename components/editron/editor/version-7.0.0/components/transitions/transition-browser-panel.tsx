"use client";

import React, { useState, useMemo } from "react";
import { useEditorContext } from "../../contexts/editor-context";
import { getTransitionsByCategory, TRANSITIONS, type TransitionCategory } from "@/lib/editron/data/transition-system";
import {
  Layers, Moon, Sun, ArrowLeft, ArrowRight, ArrowUp, ArrowDown,
  ZoomIn, ZoomOut, Zap, Eye, Scissors, AlertTriangle, Copy,
  SkipForward, Play, Search
} from "lucide-react";

const CATEGORY_LABELS: Record<TransitionCategory, string> = {
  blend: 'Blend',
  wipe: 'Wipe',
  push: 'Push',
  zoom: 'Zoom',
  editorial: 'Editorial Cuts',
  sound: 'Sound Transitions',
};

const CATEGORY_ORDER: TransitionCategory[] = ['blend', 'wipe', 'push', 'zoom', 'editorial', 'sound'];

const ICON_MAP: Record<string, React.ReactNode> = {
  Layers: <Layers className="h-4 w-4" />,
  Moon: <Moon className="h-4 w-4" />,
  Sun: <Sun className="h-4 w-4" />,
  ArrowLeft: <ArrowLeft className="h-4 w-4" />,
  ArrowRight: <ArrowRight className="h-4 w-4" />,
  ArrowUp: <ArrowUp className="h-4 w-4" />,
  ArrowDown: <ArrowDown className="h-4 w-4" />,
  ZoomIn: <ZoomIn className="h-4 w-4" />,
  ZoomOut: <ZoomOut className="h-4 w-4" />,
  Zap: <Zap className="h-4 w-4" />,
  Eye: <Eye className="h-4 w-4" />,
  Scissors: <Scissors className="h-4 w-4" />,
  AlertTriangle: <AlertTriangle className="h-4 w-4" />,
  Copy: <Copy className="h-4 w-4" />,
  SkipForward: <SkipForward className="h-4 w-4" />,
  Play: <Play className="h-4 w-4" />,
};

export const TransitionBrowserPanel: React.FC = () => {
  const { overlays, changeOverlay, projectId, setOverlays, selectedOverlayId } = useEditorContext();
  const [search, setSearch] = useState('');
  const [applying, setApplying] = useState<string | null>(null);

  const grouped = useMemo(() => getTransitionsByCategory(), []);

  const filteredGrouped = useMemo(() => {
    if (!search) return grouped;
    const q = search.toLowerCase();
    const result: Record<TransitionCategory, typeof grouped['blend']> = {
      blend: [], wipe: [], push: [], zoom: [], editorial: [], sound: [],
    };
    for (const [cat, items] of Object.entries(grouped)) {
      result[cat as TransitionCategory] = items.filter(
        t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [grouped, search]);

  const videoOverlays = useMemo(() =>
    overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from),
  [overlays]);

  // Check if a video overlay is selected (for targeted replace)
  const selectedOverlay = useMemo(() => {
    if (!selectedOverlayId) return null;
    return overlays.find(o => o.id === selectedOverlayId && o.type === 'video') || null;
  }, [overlays, selectedOverlayId]);

  // Find which video pair the selected overlay belongs to (for single-transition replace)
  const selectedVideoIndex = useMemo(() => {
    if (!selectedOverlay) return -1;
    return videoOverlays.findIndex(o => o.id === selectedOverlay.id);
  }, [selectedOverlay, videoOverlays]);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleApply = async (transitionId: string) => {
    if (videoOverlays.length < 2) return;
    setApplying(transitionId);
    const transDef = TRANSITIONS[transitionId];
    setStatusMsg(`Applying ${transDef?.name || transitionId}...`);

    try {
      // Determine whether to apply to a single boundary or all boundaries.
      //
      // Three cases:
      //   1. A VIDEO overlay is selected → apply after that video (single boundary)
      //   2. A TRANSITION overlay is selected → replace THAT transition (use its clipAId)
      //   3. Nothing selected → apply to all boundaries
      //
      // 2026-04-10: Previously case 2 fell through to applyToAll because
      // selectedOverlay only matched type==='video', so clicking a transition
      // tile then clicking a new transition type applied it to ALL 24 clips.
      const params: Record<string, any> = { type: transitionId };

      // Case 1: selected overlay is a video clip
      if (selectedOverlay && selectedVideoIndex >= 0 && selectedVideoIndex < videoOverlays.length - 1) {
        params.afterOverlayId = selectedOverlay.id;
      }
      // Case 2: selected overlay is a transition tile — find its clipAId to replace just that one
      else if (selectedOverlayId) {
        const selectedItem = overlays.find(o => o.id === selectedOverlayId);
        if (selectedItem?.type === 'transition' && (selectedItem as any).clipAId) {
          params.afterOverlayId = (selectedItem as any).clipAId;
        } else {
          // Selected item is neither video nor transition with clipAId — apply to all
          params.applyToAll = true;
        }
      }
      // Case 3: nothing selected
      else {
        params.applyToAll = true;
      }

      // Direct tool invocation — no AI/LLM involved, instant execution
      const res = await fetch('/api/services/editron/chat/tool-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          toolName: 'add_transition',
          params,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === 'success') {
        setStatusMsg('Transition applied!');
        // Re-fetch updated project overlays instead of reloading the page
        const projRes = await fetch(`/api/services/editron/projects/${projectId}`);
        const projData = await projRes.json().catch(() => null);
        if (projData?.project?.overlays) {
          setOverlays(projData.project.overlays);
        }
      } else {
        setStatusMsg(`Failed: ${data.message || 'Unknown error'}`);
        console.error('[TransitionBrowser] Tool error:', data.message);
      }
    } catch (err) {
      setStatusMsg('Apply failed');
      console.error('[TransitionBrowser] Apply failed:', err);
    } finally {
      setApplying(null);
      setTimeout(() => setStatusMsg(null), 2500);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {statusMsg && (
        <div className="px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-medium text-center">
          {statusMsg}
        </div>
      )}
      <div className="p-3 border-b border-zinc-800">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search transitions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-[11px] bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        {videoOverlays.length < 2 && (
          <p className="text-[10px] text-amber-400 mt-2">Need at least 2 video clips for transitions</p>
        )}
        {selectedOverlay && selectedVideoIndex >= 0 && selectedVideoIndex < videoOverlays.length - 1 && (
          <p className="text-[10px] text-emerald-400 mt-2">Click a transition to apply after the selected clip</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {CATEGORY_ORDER.map(cat => {
          const items = filteredGrouped[cat];
          if (items.length === 0) return null;

          return (
            <div key={cat}>
              <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mb-1.5">
                {CATEGORY_LABELS[cat]}
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleApply(t.id)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/editron-transition', JSON.stringify({ type: t.id, name: t.name }));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    disabled={videoOverlays.length < 2 || applying !== null}
                    className={`
                      flex flex-col items-center gap-1 p-2.5 rounded-md border text-center
                      transition-all duration-150 cursor-grab active:cursor-grabbing
                      ${applying === t.id
                        ? 'border-emerald-500 bg-emerald-900/30 text-emerald-300'
                        : 'border-zinc-700/50 bg-zinc-800/50 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800'
                      }
                      disabled:opacity-40 disabled:cursor-not-allowed
                    `}
                    title={`${t.description}\n${selectedOverlay ? 'Click to apply after selected clip' : 'Click to apply between all scenes'}, or drag to timeline.`}
                  >
                    <div className="text-zinc-400">
                      {ICON_MAP[t.icon] || <Layers className="h-4 w-4" />}
                    </div>
                    <span className="text-[10px] font-medium leading-tight">{t.name}</span>
                    <span className="text-[8px] text-zinc-500 leading-tight">
                      {t.hasVisualOverlap ? `${Math.round(t.defaultDurationFrames / 30 * 1000)}ms` : 'instant'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
