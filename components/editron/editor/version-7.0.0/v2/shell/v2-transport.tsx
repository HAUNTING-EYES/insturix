'use client';

import { SkipBack, Play, Pause, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Mono } from '@/components/primitives';
import { useEditorContext } from '../../contexts/editor-context';
import { FPS } from '../../constants';

/* ═══ Editron editor v2 · transport ══════════════════════════════════
   The v6 transport bar under the canvas: skip-to-start, play/pause,
   timecode, frame·fps, a playing-state equalizer, and a Playing/Paused
   pill. Wired to the real player state (isPlaying/currentFrame/seekTo/
   togglePlayPause/formatTime). The equalizer is decorative (CSS-driven
   while playing) — real audio levels aren't exposed. */

export function V2Transport() {
  const { isPlaying, currentFrame, togglePlayPause, seekTo, formatTime } = useEditorContext();

  return (
    <div className="flex h-[46px] shrink-0 items-center gap-4 border-t border-ds-subtle bg-surface-raised px-4">
      <style>{`@keyframes v2eq{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}`}</style>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => seekTo(0)} title="Skip to start" className="flex h-8 w-8 items-center justify-center rounded-button border border-ds-subtle bg-surface-deeper text-ds-secondary hover:bg-surface-well focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60"><SkipBack size={15} /></button>
        <button type="button" onClick={togglePlayPause} title={isPlaying ? 'Pause' : 'Play'} className={cn('flex h-[34px] w-[34px] items-center justify-center rounded-full border border-gold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60', isPlaying ? 'bg-gold text-[#241B08]' : 'bg-transparent text-gold')}>{isPlaying ? <Pause size={15} /> : <Play size={15} />}</button>
      </div>
      <span className="font-mono text-[13px] tracking-[0.12em] text-gold">TC {formatTime(currentFrame)}</span>
      <span className="font-mono text-[10px] text-ds-dim">f{currentFrame} · {FPS}fps</span>
      <div className="ml-1.5 flex items-center gap-1.5 text-ds-muted">
        <Volume2 size={13} />
        <div className="flex h-[15px] items-end gap-0.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className={cn('w-[2.5px] origin-bottom rounded-[1px]', i > 9 ? 'bg-status-danger' : i > 7 ? 'bg-gold' : 'bg-status-success', !isPlaying && 'opacity-30')} style={{ height: 3 + i, animation: isPlaying ? `v2eq ${0.6 + (i % 4) * 0.12}s ease-in-out infinite` : undefined }} />
          ))}
        </div>
      </div>
      <span className="flex-1" />
      <span className="inline-flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', isPlaying ? 'bg-status-success' : 'bg-ds-faint')} />
        <Mono size="8" className={isPlaying ? 'text-status-success' : 'text-ds-muted'}>{isPlaying ? 'Playing' : 'Paused'}</Mono>
      </span>
    </div>
  );
}
