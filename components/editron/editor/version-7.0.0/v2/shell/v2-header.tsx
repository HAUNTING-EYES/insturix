'use client';

import { useState, useEffect } from 'react';
import { FileAudio2, Music2, Redo2, Smartphone, Sparkles, Undo2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Mono } from '@/components/primitives';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useEditorContext } from '../../contexts/editor-context';
import type { AspectRatio } from '../../types';
import type {
  RenderDeliveryManifest,
  RenderMusicDeliveryMode,
} from '@/lib/editron/services/render-delivery-manifest';

/* ═══ Editron editor v2 · header ═════════════════════════════════════
   The v6 header ported to real wiring: EDITRON wordmark, project name +
   autosave dropdown, aspect segmented (all 4 real ratios), Undo/Redo,
   Ask Editron toggle, QA / mobile / Render. Consumes the real editor
   context; shell-level toggles (AI panel, modals) come in via props. */

const ASPECTS: AspectRatio[] = ['16:9', '9:16', '1:1', '4:5'];

const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-button border border-ds-subtle bg-surface-deeper text-ds-secondary transition-colors hover:bg-surface-well disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60';

function formatCueTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function V2Header({
  projectName,
  aiOpen,
  onToggleAi,
  onOpenRecovery,
  onOpenQuality,
  onOpenMobilePreview,
}: {
  projectName: string;
  aiOpen: boolean;
  onToggleAi: () => void;
  onOpenRecovery?: () => void;
  onOpenQuality?: () => void;
  onOpenMobilePreview?: () => void;
}) {
  const { aspectRatio, setAspectRatio, undo, redo, canUndo, canRedo, renderMedia, state } = useEditorContext();
  const [saveMenu, setSaveMenu] = useState(false);
  const [musicDeliveryMode, setMusicDeliveryMode] =
    useState<RenderMusicDeliveryMode>('embedded');
  const rendering = state?.status === 'rendering' || state?.status === 'invoking';
  const deliveryManifest: RenderDeliveryManifest | undefined =
    state?.status === 'done' ? state.deliveryManifest : undefined;
  const musicHandoff = deliveryManifest?.music.handoff;

  // The header receives the project id; fetch the friendly project name
  // (falls back to the id if the project has no name / the fetch fails).
  const [fetchedName, setFetchedName] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/services/editron/projects/${projectName}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.project?.name) setFetchedName(d.project.name); })
      .catch(() => {});
    return () => { alive = false; };
  }, [projectName]);
  const displayName = fetchedName ?? projectName;

  return (
    <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-ds-subtle bg-surface-raised px-3.5">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 shrink-0 rounded-full bg-gold" />
        <span className="max-w-[260px] truncate text-[13.5px] font-bold" title={displayName}>{displayName}</span>
        <span className="relative">
          <button type="button" onClick={() => setSaveMenu((m) => !m)} className="inline-flex items-center gap-1.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60">
            <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
            <Mono size="8">Saved</Mono>
            <span className="text-[9px] text-ds-dim">▾</span>
          </button>
          {saveMenu && (
            <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[210px] rounded-card border border-ds-emphasis bg-surface-raised p-2.5">
              <Mono size="8" className="mb-2 block">Autosave</Mono>
              <div className="mb-1.5 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-status-success" /><span className="text-[12px] text-ds-secondary">Backed up locally every edit.</span></div>
              <button type="button" onClick={() => { setSaveMenu(false); onOpenRecovery?.(); }} className="w-full rounded-button border border-ds-subtle bg-surface-deeper py-1.5 text-[11.5px] font-bold text-ds-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60">Recover a version…</button>
            </div>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="inline-flex rounded-button border border-ds-subtle bg-surface-deeper p-0.5">
          {ASPECTS.map((a) => (
            <button key={a} type="button" onClick={() => setAspectRatio(a)} className={cn('rounded-[5px] px-2.5 py-[5px] font-mono text-[10px] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60', aspectRatio === a ? 'bg-gold font-bold text-[#241B08]' : 'text-ds-muted hover:text-ds-secondary')}>{a}</button>
          ))}
        </div>
        <button type="button" onClick={undo} disabled={!canUndo} title="Undo" className={iconBtn}><Undo2 size={15} /></button>
        <button type="button" onClick={redo} disabled={!canRedo} title="Redo" className={iconBtn}><Redo2 size={15} /></button>
        <button type="button" onClick={onToggleAi} className={cn('inline-flex h-8 items-center gap-1.5 rounded-button border px-3 text-[12.5px] font-bold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60', aiOpen ? 'border-gold/40 bg-gold/10 text-gold' : 'border-ds-subtle bg-surface-deeper text-ds-secondary hover:bg-surface-well')}><Sparkles size={14} />Ask AI</button>
        <button type="button" onClick={onOpenQuality} title="Quality review" className={iconBtn}><span className="font-mono text-[10px] font-bold">QA</span></button>
        <button type="button" onClick={onOpenMobilePreview} title="Mobile preview" className={iconBtn}><Smartphone size={15} /></button>
        <div className="inline-flex h-8 rounded-button border border-ds-subtle bg-surface-deeper p-0.5" aria-label="Music delivery mode">
          <button
            type="button"
            onClick={() => setMusicDeliveryMode('embedded')}
            disabled={rendering}
            title="Render with licensed music embedded"
            className={cn(
              'inline-flex items-center gap-1 rounded-[5px] px-2 font-mono text-[10px] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60',
              musicDeliveryMode === 'embedded'
                ? 'bg-surface-well font-bold text-ds-primary'
                : 'text-ds-muted hover:text-ds-secondary',
            )}
          >
            <Volume2 size={12} />
            Mixed
          </button>
          <button
            type="button"
            onClick={() => setMusicDeliveryMode('platform-native')}
            disabled={rendering}
            title="Render a clean master for music added on the destination platform"
            className={cn(
              'inline-flex items-center gap-1 rounded-[5px] px-2 font-mono text-[10px] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60',
              musicDeliveryMode === 'platform-native'
                ? 'bg-surface-well font-bold text-ds-primary'
                : 'text-ds-muted hover:text-ds-secondary',
            )}
          >
            <Music2 size={12} />
            Clean
          </button>
        </div>
        {musicHandoff && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" title="Platform music handoff" className={iconBtn}>
                <FileAudio2 size={15} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 border-ds-emphasis bg-surface-raised p-3 text-ds-secondary">
              <Mono size="8" className="mb-2 block text-gold">Platform music handoff</Mono>
              <div className="space-y-1.5 text-[11.5px]">
                <div className="flex justify-between gap-3">
                  <span className="text-ds-muted">Master</span>
                  <span className="font-semibold text-ds-primary">Clean, no BGM</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ds-muted">Track</span>
                  <span className="max-w-[170px] truncate text-right text-ds-primary">
                    {musicHandoff.track.title ?? 'Choose in platform'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ds-muted">Timeline</span>
                  <span className="font-mono text-ds-primary">
                    {formatCueTime(musicHandoff.timing.timelineStartMs)}
                    {' - '}
                    {formatCueTime(musicHandoff.timing.timelineEndMs)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ds-muted">Cue</span>
                  <span className="text-ds-primary">
                    {musicHandoff.timing.timelineBeatEntryMs === null
                      ? 'Manual'
                      : formatCueTime(musicHandoff.timing.timelineBeatEntryMs)}
                  </span>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
        <button type="button" onClick={() => renderMedia(musicDeliveryMode)} disabled={rendering} className="inline-flex h-8 items-center gap-1.5 rounded-button border border-gold bg-gold px-4 text-[12.5px] font-extrabold text-[#241B08] hover:bg-[#E0B86A] disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60"><span className="h-2 w-2 rounded-full bg-[#241B08]" />{rendering ? 'Rendering…' : 'Render'}</button>
      </div>
    </div>
  );
}
