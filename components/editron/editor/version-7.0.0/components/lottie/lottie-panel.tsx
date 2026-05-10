"use client";

import React, { useState, useCallback } from "react";
import { useEditorContext } from "../../contexts/editor-context";
import { Search, Plus, Loader2, Sparkles } from "lucide-react";
import { OverlayType } from "../../types";

interface LottieResult {
  id: string;
  title: string;
  previewUrl: string;
  lottieUrl: string;
  gifUrl: string;
  author: string;
}

/**
 * LottieFiles Panel — browse and add Lottie animations as HTML overlays.
 */
export const LottiePanel: React.FC = () => {
  const { addOverlay } = useEditorContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LottieResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);

    try {
      const res = await fetch(`/api/services/editron/lottie/search?q=${encodeURIComponent(query)}&limit=16`);
      const data = await res.json().catch(() => ({}));
      if (data.results) {
        setResults(data.results);
      }
    } catch (err) {
      console.error('[LottiePanel] Search failed:', err);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleAdd = useCallback((lottie: LottieResult) => {
    setAdding(lottie.id);

    // Use animated GIF URL — works natively in Remotion's <Img> component.
    // The GIF is a real animated image from LottieFiles CDN.
    // Web component approach (<dotlottie-player>) doesn't work in Remotion's
    // rendering context because external scripts don't load in the iframe.
    const animatedUrl = lottie.gifUrl || lottie.previewUrl || lottie.lottieUrl;

    addOverlay({
      type: OverlayType.IMAGE,
      from: 0,
      durationInFrames: 90, // 3 seconds at 30fps
      row: 6, // ROW.MOTION_GRAPHICS — Lottie animations belong on the graphics track, not BGM (was 1)
      left: 100,
      top: 100,
      width: 300,
      height: 300,
      isDragging: false,
      rotation: 0,
      content: animatedUrl,
      src: animatedUrl,
      styles: {
        opacity: 1,
        objectFit: 'contain',
        backgroundColor: 'transparent',
      },
      metadata: {
        source: 'lottiefiles',
        lottieUrl: lottie.lottieUrl,
        title: lottie.title,
      },
    } as any);

    setAdding(null);
  }, [addOverlay]);

  const suggestions = [
    'arrow', 'loading', 'check', 'star', 'heart',
    'fire', 'confetti', 'subscribe', 'like', 'share',
    'graph', 'chart', 'money', 'rocket', 'celebration',
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search animations..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full h-8 pl-8 pr-3 text-[11px] bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="h-8 px-3 text-[11px] bg-purple-600 hover:bg-purple-700 text-white rounded-md disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Search'}
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {suggestions.slice(0, 10).map(s => (
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
            <Sparkles className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-[11px] text-zinc-500">Search LottieFiles animations</p>
            <p className="text-[10px] text-zinc-600 mt-1">Animated graphics for lower thirds, callouts, decorations</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {results.map((lottie) => (
            <div
              key={lottie.id}
              className="relative rounded-lg border border-zinc-700/50 bg-zinc-800/50 overflow-hidden group cursor-pointer hover:border-purple-500/50"
              onClick={() => handleAdd(lottie)}
            >
              <div className="aspect-square bg-zinc-900 flex items-center justify-center p-2">
                {lottie.gifUrl ? (
                  <img
                    src={lottie.gifUrl}
                    alt={lottie.title}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <Sparkles className="h-8 w-8 text-zinc-600" />
                )}
              </div>

              <div className="p-1.5">
                <p className="text-[10px] text-zinc-300 truncate">{lottie.title}</p>
                <p className="text-[8px] text-zinc-500">{lottie.author}</p>
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {adding === lottie.id ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <Plus className="h-6 w-6 text-white" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
