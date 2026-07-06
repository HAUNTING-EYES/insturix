'use client';

import { useState } from 'react';
import { Undo2, Redo2, Sparkles, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Mono } from '@/components/primitives';
import { useEditorContext } from '../../contexts/editor-context';
import type { AspectRatio } from '../../types';

/* ═══ Editron editor v2 · header ═════════════════════════════════════
   The v6 header ported to real wiring: EDITRON wordmark, project name +
   autosave dropdown, aspect segmented (all 4 real ratios), Undo/Redo,
   Ask Editron toggle, QA / mobile / Render. Consumes the real editor
   context; shell-level toggles (AI panel, modals) come in via props. */

const ASPECTS: AspectRatio[] = ['16:9', '9:16', '1:1', '4:5'];

const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-button border border-ds-subtle bg-surface-deeper text-ds-secondary transition-colors hover:bg-surface-well disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60';

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
  const rendering = state?.status === 'rendering';

  return (
    <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-ds-subtle bg-surface-raised px-3.5">
      <div className="flex items-center gap-3.5">
        <Mono size="12" className="font-bold tracking-[0.18em] text-gold">EDITRON</Mono>
        <span className="h-4 w-px bg-ds-subtle" />
        <span className="text-[13.5px] font-bold">{projectName}</span>
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
        <button type="button" onClick={onToggleAi} className={cn('inline-flex h-8 items-center gap-1.5 rounded-button border px-3 text-[12.5px] font-bold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60', aiOpen ? 'border-gold/40 bg-gold/10 text-gold' : 'border-ds-subtle bg-surface-deeper text-ds-secondary hover:bg-surface-well')}><Sparkles size={14} />Ask Editron</button>
        <button type="button" onClick={onOpenQuality} title="Quality review" className={iconBtn}><span className="font-mono text-[10px] font-bold">QA</span></button>
        <button type="button" onClick={onOpenMobilePreview} title="Mobile preview" className={iconBtn}><Smartphone size={15} /></button>
        <button type="button" onClick={() => renderMedia()} disabled={rendering} className="inline-flex h-8 items-center gap-1.5 rounded-button border border-gold bg-gold px-4 text-[12.5px] font-extrabold text-[#241B08] hover:bg-[#E0B86A] disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60"><span className="h-2 w-2 rounded-full bg-[#241B08]" />{rendering ? 'Rendering…' : 'Render'}</button>
      </div>
    </div>
  );
}
