"use client";

import React, { useState, useCallback } from "react";
import { useEditorContext } from "../../contexts/editor-context";
import { Search, Play, Plus, Loader2, Volume2 } from "lucide-react";
import { OverlayType } from "../../types";

interface SFXResult {
  title: string;
  url: string;
  duration: number;
  source: string;
}

/**
 * SFX Library Panel — browse and add sound effects from Freesound/Pixabay.
 * Search by keyword, preview clips, drag or click to add to timeline.
 */
export const SFXLibraryPanel: React.FC = () => {
  const { addOverlay, overlays } = useEditorContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SFXResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audioRef] = useState(() => typeof Audio !== 'undefined' ? new Audio() : null);
  const [adding, setAdding] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);

    try {
      const res = await fetch(`/api/services/editron/sfx-library/search?q=${encodeURIComponent(query)}&limit=12`);
      const data = await res.json().catch(() => ({}));
      if (data.results) {
        setResults(data.results);
      }
    } catch (err) {
      console.error('[SFXLibrary] Search failed:', err);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handlePreview = useCallback((url: string) => {
    if (!audioRef) return;
    if (previewUrl === url) {
      audioRef.pause();
      setPreviewUrl(null);
    } else {
      audioRef.src = url;
      audioRef.play().catch(() => {});
      setPreviewUrl(url);
      audioRef.onended = () => setPreviewUrl(null);
    }
  }, [audioRef, previewUrl]);

  const handleAddToTimeline = useCallback(async (sfx: SFXResult) => {
    setAdding(sfx.url);
    try {
      // Find the latest frame position (end of last overlay)
      const maxFrame = overlays.reduce((max, o) => Math.max(max, o.from + o.durationInFrames), 0);
      const fps = 30;

      addOverlay({
        type: OverlayType.SOUND,
        from: 0, // Place at start — user can drag to desired position
        durationInFrames: Math.round(sfx.duration * fps),
        row: 6, // SFX row
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        isDragging: false,
        rotation: 0,
        content: sfx.url,
        src: sfx.url,
        styles: { volume: 0.5, opacity: 1 },
      } as any);
    } catch (err) {
      console.error('[SFXLibrary] Add failed:', err);
    } finally {
      setAdding(null);
    }
  }, [addOverlay, overlays]);

  // Quick search suggestions
  const suggestions = [
    'whoosh', 'click', 'chime', 'impact', 'ambient',
    'nature', 'city', 'water', 'fire', 'wind',
    'typing', 'notification', 'footsteps', 'applause',
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search sounds..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full h-8 pl-8 pr-3 text-xs bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-md disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Search'}
          </button>
        </div>

        {/* Quick suggestion chips */}
        <div className="flex flex-wrap gap-1">
          {suggestions.slice(0, 8).map(s => (
            <button
              key={s}
              onClick={() => { setQuery(s); }}
              className="px-2 py-0.5 text-[9px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-full"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {results.length === 0 && !loading && (
          <div className="text-center py-8">
            <Volume2 className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">Search for sound effects</p>
            <p className="text-[10px] text-zinc-600 mt-1">Freesound CC0 library — free for commercial use</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 text-emerald-400 animate-spin" />
          </div>
        )}

        <div className="space-y-1">
          {results.map((sfx, i) => (
            <div
              key={`${sfx.url}-${i}`}
              className="flex items-center gap-2 p-2 rounded-md bg-zinc-800/50 hover:bg-zinc-800 group"
            >
              <button
                onClick={() => handlePreview(sfx.url)}
                className="flex-shrink-0 p-1.5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
              >
                <Play className={`h-3 w-3 ${previewUrl === sfx.url ? 'text-emerald-400' : ''}`} />
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-200 truncate">{sfx.title}</p>
                <p className="text-[10px] text-zinc-500">{sfx.duration}s • {sfx.source}</p>
              </div>

              <button
                onClick={() => handleAddToTimeline(sfx)}
                disabled={adding === sfx.url}
                className="flex-shrink-0 p-1.5 rounded-md bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Add to timeline"
              >
                {adding === sfx.url ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
