'use client';

import { useState, useEffect } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Play, Zap, Film, Music, Type, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EDLSuggestion {
  type: string;
  frame: number;
  reason: string;
  action: string; // The chat prompt to execute this suggestion
  icon: 'cut' | 'transition' | 'graphic' | 'zoom' | 'filter' | 'caption' | 'audio';
}

interface EDLSuggestionsProps {
  projectId: string;
  onSuggestionClick: (prompt: string) => void;
}

const ICON_MAP = {
  cut: <Zap className="h-3 w-3" />,
  transition: <Film className="h-3 w-3" />,
  graphic: <Type className="h-3 w-3" />,
  zoom: <Play className="h-3 w-3" />,
  filter: <Palette className="h-3 w-3" />,
  caption: <Type className="h-3 w-3" />,
  audio: <Music className="h-3 w-3" />,
};

/**
 * EDL Suggestions Panel
 *
 * Auto-loads cached analysis for the project and generates
 * lightweight editing suggestions from the Reactive Edit Engine.
 * Shows clickable suggestion cards that trigger AI chat tool calls.
 */
export function EDLSuggestions({ projectId, onSuggestionClick }: EDLSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<EDLSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded || !projectId || projectId === 'default') return;
    loadSuggestions();
  }, [projectId]);

  const loadSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/services/editron/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, mode: 'cached-suggestions' }),
      });

      if (!res.ok) {
        if (res.status === 401) return; // Not logged in, skip silently
        throw new Error(`Analysis failed: ${res.status}`);
      }

      const data = await res.json();
      if (!data.success || !data.editDecisionList?.decisions?.length) {
        setLoaded(true);
        return; // No suggestions available
      }

      // Convert EDL decisions to user-friendly suggestions
      const edl = data.editDecisionList;
      const fps = 30;
      const mapped: EDLSuggestion[] = edl.decisions
        .filter((d: any) => d.confidence > 0.5) // Only confident suggestions
        .slice(0, 8) // Max 8 suggestions
        .map((d: any) => {
          const timeStr = `${Math.floor(d.frame / fps / 60)}:${String(Math.floor((d.frame / fps) % 60)).padStart(2, '0')}`;
          let icon: EDLSuggestion['icon'] = 'cut';
          let action = '';

          switch (d.type) {
            case 'cut':
              icon = 'cut';
              action = `Add a cut at ${timeStr}`;
              break;
            case 'transition':
              icon = 'transition';
              action = `Add a ${d.params?.type || 'dissolve'} transition at ${timeStr}`;
              break;
            case 'zoom':
              icon = 'zoom';
              action = `Add a zoom punch at ${timeStr}`;
              break;
            case 'graphic':
              icon = 'graphic';
              action = `Add a ${d.params?.graphicType || 'callout'} graphic at ${timeStr}: "${d.params?.text || ''}"`;
              break;
            case 'filter-change':
            case 'filter':
              icon = 'filter';
              action = `Apply ${d.params?.filterPresetId || 'cinematic'} filter at ${timeStr}`;
              break;
            case 'caption-emphasis':
              icon = 'caption';
              action = `Emphasize caption at ${timeStr}`;
              break;
            case 'audio-duck':
              icon = 'audio';
              action = `Adjust audio ducking at ${timeStr}`;
              break;
            default:
              action = `${d.type} at ${timeStr}: ${d.reason}`;
          }

          return {
            type: d.type,
            frame: d.frame,
            reason: d.reason,
            action,
            icon,
          };
        });

      setSuggestions(mapped);
      setLoaded(true);
    } catch (err: any) {
      console.error('[EDL-Suggestions] Error:', err.message);
      setError(err.message);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  // Don't render if no suggestions and not loading
  if (loaded && suggestions.length === 0 && !loading) return null;
  if (!loaded && !loading) return null;

  return (
    <div className="mx-2 mb-2 rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          {loading ? 'Analyzing your project...' : `${suggestions.length} edit suggestions`}
        </span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {/* Suggestions list */}
      {expanded && (
        <div className="px-2 pb-2 space-y-1">
          {loading && (
            <div className="text-[10px] text-zinc-500 px-2 py-1">Running 5-Track analysis...</div>
          )}
          {error && (
            <div className="text-[10px] text-red-400 px-2 py-1">{error}</div>
          )}
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(s.action)}
              className="w-full flex items-start gap-2 px-2 py-1.5 rounded text-left text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors group"
            >
              <span className="mt-0.5 text-zinc-600 group-hover:text-amber-400 transition-colors">
                {ICON_MAP[s.icon]}
              </span>
              <span className="flex-1 leading-relaxed">{s.action}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
