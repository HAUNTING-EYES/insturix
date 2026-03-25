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
};

const CATEGORY_ORDER: TransitionCategory[] = ['blend', 'wipe', 'push', 'zoom', 'editorial'];

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
  const { overlays, changeOverlay } = useEditorContext();
  const [search, setSearch] = useState('');
  const [applying, setApplying] = useState<string | null>(null);

  const grouped = useMemo(() => getTransitionsByCategory(), []);

  const filteredGrouped = useMemo(() => {
    if (!search) return grouped;
    const q = search.toLowerCase();
    const result: Record<TransitionCategory, typeof grouped['blend']> = {
      blend: [], wipe: [], push: [], zoom: [], editorial: [],
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

  const handleApplyToAll = async (transitionId: string) => {
    if (videoOverlays.length < 2) return;
    setApplying(transitionId);

    try {
      // Call the add_transition tool via the AI chat API
      const res = await fetch('/api/services/editron/chat/tool-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: 'add_transition',
          params: { type: transitionId, applyToAll: true },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === 'success') {
        // Refresh project to show changes
        window.location.reload();
      }
    } catch (err) {
      console.error('[TransitionBrowser] Apply failed:', err);
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-zinc-800">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search transitions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        {videoOverlays.length < 2 && (
          <p className="text-[10px] text-amber-400 mt-2">Need at least 2 video clips for transitions</p>
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
                    onClick={() => handleApplyToAll(t.id)}
                    disabled={videoOverlays.length < 2 || applying !== null}
                    className={`
                      flex flex-col items-center gap-1 p-2.5 rounded-md border text-center
                      transition-all duration-150
                      ${applying === t.id
                        ? 'border-emerald-500 bg-emerald-900/30 text-emerald-300'
                        : 'border-zinc-700/50 bg-zinc-800/50 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800'
                      }
                      disabled:opacity-40 disabled:cursor-not-allowed
                    `}
                    title={t.description}
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
