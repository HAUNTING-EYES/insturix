'use client';

import { useState, useCallback } from 'react';
import { Search, Play, Plus, Loader2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Mono, inputClass } from '@/components/primitives';
import { useEditorContext } from '../../contexts/editor-context';
import { OverlayType } from '../../types';

/* ═══ Editron editor v2 · Sound FX (browse) ══════════════════════════
   v2-native re-skin of the real SFXLibraryPanel. Same search/preview/add
   logic (the /sfx-library/search endpoint + addOverlay), only re-tinted
   from the v1 emerald/zinc to the gold/warm tokens. Fixes the green
   search button the founder flagged. */

interface SFXResult {
  providerAssetId: string;
  title: string;
  url: string;
  duration: number;
  source: 'Freesound';
  license: 'CC0-1.0';
  attributionRequired: false;
}

const SUGGESTIONS = ['whoosh', 'click', 'chime', 'impact', 'ambient', 'nature', 'city', 'water'];

export function V2SfxBrowse() {
  const { addOverlay } = useEditorContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SFXResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audioRef] = useState(() => (typeof Audio !== 'undefined' ? new Audio() : null));
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    setError(null);
    try {
      const res = await fetch(`/api/services/editron/sfx-library/search?q=${encodeURIComponent(query)}&limit=12`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Sound search failed');
        return;
      }
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      console.error('[SFXLibrary] Search failed:', err);
      setError('Sound search failed');
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

  const add = useCallback(async (sfx: SFXResult) => {
    setAdding(sfx.url);
    try {
      addOverlay({
        type: OverlayType.SOUND, from: 0, durationInFrames: Math.round(sfx.duration * 30), row: 0,
        left: 0, top: 0, width: 0, height: 0, isDragging: false, rotation: 0,
        content: sfx.url, src: sfx.url, styles: { volume: 0.5, opacity: 1 },
        metadata: {
          providerId: sfx.providerAssetId,
          source: 'freesound-cc0',
          title: sfx.title,
          durationMs: Math.round(sfx.duration * 1000),
        },
      } as never);
    } catch (err) {
      console.error('[SFXLibrary] Add failed:', err);
    } finally {
      setAdding(null);
    }
  }, [addOverlay]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-ds-subtle p-3">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ds-muted" />
            <input
              type="text"
              placeholder="Search sounds…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className={cn(inputClass, 'h-8 pl-8 text-[11px]')}
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="flex h-8 shrink-0 items-center rounded-button border border-gold bg-gold px-3 text-[11px] font-bold text-[#241B08] hover:bg-[#E0B86A] disabled:opacity-40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Search'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setQuery(s)} className="rounded-full bg-surface-well px-2 py-0.5 text-[9px] text-ds-muted hover:bg-surface-deeper hover:text-ds-secondary">
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {results.length === 0 && !loading && (
          <div className="py-8 text-center">
            <Volume2 className="mx-auto mb-2 h-8 w-8 text-ds-faint" />
            <Mono size="9" className="text-ds-dim">Search for sound effects</Mono>
            <p className="mt-1 text-[10px] text-ds-faint">Verified Freesound CC0</p>
          </div>
        )}
        {error && <p className="px-2 py-3 text-[10px] text-red-400">{error}</p>}
        {loading && (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>
        )}
        <div className="space-y-1">
          {results.map((sfx, i) => (
            <div key={`${sfx.url}-${i}`} className="group flex items-center gap-2 rounded-md bg-surface-deeper p-2 hover:bg-surface-well">
              <button type="button" onClick={() => handlePreview(sfx.url)} className="shrink-0 rounded-full bg-surface-well p-1.5 text-ds-secondary hover:text-gold">
                <Play className={cn('h-3 w-3', previewUrl === sfx.url && 'text-gold')} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-ds-primary">{sfx.title}</p>
                <p className="text-[10px] text-ds-muted">{sfx.duration}s • {sfx.source} • {sfx.license}</p>
              </div>
              <button
                type="button"
                onClick={() => add(sfx)}
                disabled={adding === sfx.url}
                title="Add to timeline"
                className="shrink-0 rounded-md bg-gold/15 p-1.5 text-gold opacity-0 transition-opacity hover:bg-gold/30 group-hover:opacity-100"
              >
                {adding === sfx.url ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
