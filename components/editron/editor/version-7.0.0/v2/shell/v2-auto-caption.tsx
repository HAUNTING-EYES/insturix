'use client';

import { useState, useEffect, useMemo } from 'react';
import { Wand2, Loader2, AlertCircle, Languages } from 'lucide-react';
import { Mono, Select } from '@/components/primitives';
import { cn } from '@/lib/utils';
import { useEditorContext } from '../../contexts/editor-context';
import { ClipOverlay, CaptionOverlay, OverlayType, CaptionWord } from '../../types';
import { groupWordsIntoCaptions } from '@/lib/editron/utils/caption-utils';
import { defaultCaptionStyles, defaultDisplayConfig } from '../../components/overlays/captions/default-caption-styles';
import { FPS } from '../../constants';

/* ═══ Editron editor v2 · AI auto-caption ════════════════════════════
   v2-native re-skin of the real AutoCaptionButton. SAME transcribe logic
   (/transcribe GET langs + POST, groupWordsIntoCaptions → addOverlay), only
   the chrome is v2 tokens instead of the shadcn white button + raw-URL
   dropdowns. Fixes the "old UI comes back" (that was the real component
   swapping placeholders as overlays loaded). No logic forked. */

type State = 'idle' | 'transcribing' | 'success' | 'error';
interface SupportedLanguage { code: string; label: string }
interface TranscribeResponse {
  success: boolean;
  words?: CaptionWord[];
  message?: string;
  error?: string;
}

const FUN_MESSAGES = ['Listening to your video…', 'Transcribing speech…', 'Finding the perfect words…', 'Almost there…'];


function videoLabel(video: ClipOverlay): string {
  const MAX = 34;
  const trunc = (s: string) => (s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s);
  const raw = (video.content ?? '').trim();
  const fromSrc = () => {
    const src = (video.src ?? '').trim();
    if (!src) return `Video ${video.id}`;
    try {
      const name = new URL(src).pathname.split('/').filter(Boolean).pop();
      return name ? trunc(decodeURIComponent(name)) : `Video ${video.id}`;
    } catch {
      const name = src.split('?')[0].split('/').filter(Boolean).pop();
      return name ? trunc(name) : `Video ${video.id}`;
    }
  };
  if (!raw || /^(data:|blob:|https?:)/i.test(raw)) return fromSrc();
  return trunc(raw);
}

export function V2AutoCaption() {
  const { overlays, addOverlay } = useEditorContext();
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);
  const [language, setLanguage] = useState('auto');
  const [funIdx, setFunIdx] = useState(0);
  const [languages, setLanguages] = useState<SupportedLanguage[]>([{ code: 'auto', label: 'Auto-detect' }]);

  const videoOverlays = useMemo(
    () => overlays.filter((o): o is ClipOverlay => o.type === OverlayType.VIDEO),
    [overlays],
  );
  const selectedVideo = useMemo(
    () => (!selectedVideoId ? videoOverlays[0] || null : videoOverlays.find((v) => v.id === selectedVideoId) || null),
    [videoOverlays, selectedVideoId],
  );

  useEffect(() => {
    fetch('/api/services/editron/transcribe')
      .then((r) => r.json())
      .then((d) => { if (d.success && d.languages) setLanguages(d.languages); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (state !== 'transcribing') return;
    const id = setInterval(() => setFunIdx((i) => (i + 1) % FUN_MESSAGES.length), 2500);
    return () => clearInterval(id);
  }, [state]);

  // Transcribe logic copied verbatim from auto-caption-button.tsx.
  const transcribe = async () => {
    if (!selectedVideo?.assetId) {
      setError('Select a video with an uploaded asset');
      setState('error');
      return;
    }
    setState('transcribing');
    setError(null);
    setFunIdx(0);
    try {
      const response = await fetch('/api/services/editron/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: selectedVideo.assetId, language: language === 'auto' ? undefined : language }),
      });
      const data: TranscribeResponse = await response.json();
      if (!data.success) throw new Error(data.error || 'Transcription failed');
      if (!data.words || data.words.length === 0) {
        setError(data.message || 'No speech detected in this video');
        setState('error');
        return;
      }
      const clipStartMs = ((selectedVideo.videoStartTime || 0) / FPS) * 1000;
      const clipDurationMs = (selectedVideo.durationInFrames / FPS) * 1000;
      const clipEndMs = clipStartMs + clipDurationMs;
      const wordsInClip = data.words
        .filter((w) => w.startMs >= clipStartMs && w.startMs < clipEndMs)
        .map((w) => ({
          ...w,
          startMs: Math.max(0, Math.round(w.startMs - clipStartMs)),
          endMs: Math.max(0, Math.round(Math.min(w.endMs - clipStartMs, clipDurationMs))),
        }))
        .filter((w) => w.endMs > w.startMs);
      if (wordsInClip.length === 0) {
        setError('No speech found in the selected video segment');
        setState('error');
        return;
      }
      const captions = groupWordsIntoCaptions(wordsInClip, {
        wordsPerGroup: defaultDisplayConfig.wordsPerGroup,
        groupByPunctuation: true,
      });
      const captionWidth = selectedVideo.width * 0.9;
      const captionHeight = selectedVideo.height * 0.18;
      const newCaption: CaptionOverlay = {
        id: Date.now(), type: OverlayType.CAPTION, from: selectedVideo.from,
        durationInFrames: selectedVideo.durationInFrames, captions,
        left: selectedVideo.left + (selectedVideo.width - captionWidth) / 2,
        top: selectedVideo.top + selectedVideo.height * 0.78,
        width: captionWidth, height: captionHeight, rotation: 0, isDragging: false,
        row: Math.max(0, selectedVideo.row - 1),
        styles: defaultCaptionStyles, displayConfig: defaultDisplayConfig, position: 'bottom',
        sourceVideoId: selectedVideo.id,
      } as CaptionOverlay;
      addOverlay(newCaption);
      setState('success');
      setTimeout(() => setState('idle'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate captions');
      setState('error');
    }
  };

  if (videoOverlays.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-ds-subtle bg-surface-deeper p-3 text-center">
        <p className="text-[12px] text-ds-muted">Add a video to the timeline to auto-caption it.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {videoOverlays.length > 1 && (
        <Select size="sm" aria-label="Video to caption" value={String(selectedVideo?.id ?? '')} onChange={(v) => setSelectedVideoId(Number(v))}
          options={videoOverlays.map((v) => ({ value: String(v.id), label: videoLabel(v) }))} />
      )}

      <div className="flex items-center gap-2">
        <Languages size={14} className="shrink-0 text-ds-muted" />
        <Select size="sm" aria-label="Caption language" className="flex-1" value={language} onChange={setLanguage}
          options={languages.map((l) => ({ value: l.code, label: l.label }))} />
      </div>

      <button
        type="button"
        onClick={transcribe}
        disabled={state === 'transcribing' || !selectedVideo}
        className={cn(
          'inline-flex w-full items-center justify-center gap-2 rounded-button border px-4 py-2.5 text-[12.5px] font-extrabold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60 disabled:opacity-60',
          'border-gold bg-gold text-[#241B08] hover:bg-[#E0B86A]',
        )}
      >
        {state === 'transcribing' ? (
          <><Loader2 size={14} className="animate-spin" />{FUN_MESSAGES[funIdx]}</>
        ) : state === 'success' ? (
          <>✓ Captions added</>
        ) : (
          <><Wand2 size={14} /> Generate captions</>
        )}
      </button>

      {state === 'error' && error && (
        <div className="flex items-start gap-2 rounded-md border border-status-danger/40 bg-status-danger/10 p-2.5">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-status-danger" />
          <div>
            <p className="text-[12px] text-status-danger">{error}</p>
            <button type="button" onClick={() => { setState('idle'); setError(null); }} className="mt-1 text-[11px] text-ds-muted underline hover:text-ds-secondary">Try again</button>
          </div>
        </div>
      )}

      <Mono size="7" className="text-center text-ds-faint">Powered by Deepgram · 20+ languages</Mono>
    </div>
  );
}
