'use client';

import { Trash2, AlignLeft, AlignCenter, AlignRight, X } from 'lucide-react';
import { Mono, Glyph, Select } from '@/components/primitives';
import { cn } from '@/lib/utils';
import { useEditorContext } from '../../contexts/editor-context';
import { OverlayType, type Overlay, type TextOverlay, type ClipOverlay, type ImageOverlay, type SoundOverlay } from '../../types';
import { KeyframeInspectorPanel } from '../../components/overlays/shared/keyframe-inspector-panel';
import { animationTemplates } from '../../templates/animation-templates';

/* ═══ Editron editor v2 · properties panel (264px) ═══════════════════
   The v6 right-hand editor. Transform + Opacity + the per-TYPE editor
   (Content/Size/Weight/Colour/Align/Animation for text, and the real
   equivalents for video/image/sound) + the keyframe inspector. Every
   control writes a REAL overlay field via changeOverlay — nothing forked,
   nothing fabricated (animation keys come from animationTemplates). */

const GLYPH: Partial<Record<OverlayType, string>> = {
  [OverlayType.TEXT]: 'Tx', [OverlayType.VIDEO]: 'Vd', [OverlayType.IMAGE]: 'Im',
  [OverlayType.CAPTION]: 'Cc', [OverlayType.SOUND]: 'Au', [OverlayType.STICKER]: 'St',
  [OverlayType.SHAPE]: 'Sh', [OverlayType.HTML_SCENE]: 'Ht', [OverlayType.MOTION_GRAPHIC]: 'Mg',
  [OverlayType.GENERATED_SCENE]: 'Gn', [OverlayType.TRANSITION]: 'Tr', [OverlayType.TEMPLATE]: 'Tm',
  [OverlayType.LOTTIE]: 'Lt',
};

const SWATCHES = ['#ECE9E1', '#D4A652', '#B5B2A8', '#7A776E'];
const WEIGHTS = ['300', '400', '500', '600', '700', '800', '900'];
const FITS = ['contain', 'cover', 'fill', 'none', 'scale-down'] as const;

const labelCls = 'mb-1.5 block text-ds-secondary';
const boxCls = 'w-full rounded-md border border-ds-subtle bg-surface-canvas px-2.5 py-1.5 font-mono text-[12px] text-ds-primary outline-hidden focus-visible:ring-1 focus-visible:ring-gold/50';

function NumField({ label, value, onCommit }: { label: string; value: number; onCommit: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1 rounded-md border border-ds-subtle bg-surface-canvas px-2.5 py-1.5">
      <Mono size="7" className="text-ds-dim">{label}</Mono>
      <input
        type="number"
        key={value}
        defaultValue={Math.round(value)}
        onBlur={(e) => onCommit(Number(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-full bg-transparent font-mono text-[12px] text-ds-primary outline-hidden"
      />
    </label>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <Mono size="8" className={labelCls}>{label}</Mono>
      {children}
    </div>
  );
}

/** Enter-animation pills sourced from the real animationTemplates. */
function AnimationPills({ current, onPick }: { current?: string; onPick: (key: string | undefined) => void }) {
  const entries = Object.entries(animationTemplates) as [string, { name: string }][];
  const pill = (active: boolean) =>
    cn('rounded-button border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-hidden',
      active ? 'border-gold bg-gold/10 text-gold' : 'border-ds-subtle bg-surface-deeper text-ds-secondary hover:bg-surface-well');
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={pill(!current)} onClick={() => onPick(undefined)}>None</button>
      {entries.map(([key, tpl]) => (
        <button key={key} type="button" className={pill(current === key)} onClick={() => onPick(key)}>{tpl.name}</button>
      ))}
    </div>
  );
}

const closeBtn = 'flex h-6 w-6 shrink-0 items-center justify-center rounded text-ds-muted transition-colors hover:bg-surface-well hover:text-ds-secondary focus-visible:outline-hidden';

export function V2PropsPanel({ onClose }: { onClose?: () => void }) {
  const { overlays, selectedOverlayId, changeOverlay, deleteOverlay, setSelectedOverlayId } = useEditorContext();
  const sel = overlays.find((o) => o.id === selectedOverlayId) ?? null;

  if (!sel) {
    return (
      <div className="relative flex w-[264px] shrink-0 items-center justify-center border-r border-ds-subtle bg-surface-canvas p-4">
        {onClose && (
          <button type="button" onClick={onClose} title="Close panel (Esc)" className={`absolute right-2 top-2 ${closeBtn}`}>
            <X size={14} />
          </button>
        )}
        <Mono size="10" className="text-ds-dim">Select an overlay</Mono>
      </div>
    );
  }

  const opacity = (sel as Overlay & { styles?: { opacity?: number } }).styles?.opacity ?? 1;
  const hasScaleTrack = !!sel.keyframeTracks?.some((t) => t.property === 'scale');

  const setProp = (patch: Partial<Overlay>) => changeOverlay(sel.id, patch);
  const setStyle = (patch: Record<string, unknown>) =>
    changeOverlay(sel.id, (o) => ({ ...o, styles: { ...(o as Overlay & { styles?: Record<string, unknown> }).styles, ...patch } } as Overlay));
  const setOpacity = (v: number) => setStyle({ opacity: v });
  const setAnim = (enter: string | undefined) =>
    setStyle({ animation: { ...(sel as { styles?: { animation?: object } }).styles?.animation, enter } });

  return (
    <div className="flex w-[264px] shrink-0 flex-col overflow-y-auto border-r border-ds-subtle bg-surface-canvas p-4">
      {/* Type header */}
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded border border-gold/40 px-1.5 py-0.5"><Glyph active>{GLYPH[sel.type] ?? '••'}</Glyph></span>
          <Mono size="10" className="text-gold">{sel.type.replace(/-/g, ' ')} overlay</Mono>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} title="Close panel (Esc)" className={closeBtn}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Transform */}
      <Mono size="8" className="mb-2 block text-ds-secondary">Transform</Mono>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Pos X" value={sel.left} onCommit={(n) => setProp({ left: n })} />
        <NumField label="Pos Y" value={sel.top} onCommit={(n) => setProp({ top: n })} />
        <div className="flex flex-col gap-1 rounded-md border border-ds-subtle bg-surface-canvas px-2.5 py-1.5">
          <Mono size="7" className="text-ds-dim">Scale</Mono>
          <span className="font-mono text-[12px] text-ds-muted">{hasScaleTrack ? 'keyframed' : '100%'}</span>
        </div>
        <NumField label="Rotation°" value={sel.rotation} onCommit={(n) => setProp({ rotation: n })} />
      </div>

      {/* Opacity */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <Mono size="7" className="text-ds-dim">Opacity</Mono>
          <span className="font-mono text-[10px] text-ds-muted">{Math.round(opacity * 100)}%</span>
        </div>
        <input type="range" min={0} max={1} step={0.01} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-gold" />
      </div>

      {/* ── Per-type editor ──────────────────────────────────────── */}
      {sel.type === OverlayType.TEXT && (() => {
        const t = sel as TextOverlay;
        const size = parseInt(String(t.styles?.fontSize ?? '44'), 10) || 44;
        const color = t.styles?.color ?? '#ECE9E1';
        const align = t.styles?.textAlign ?? 'left';
        return (
          <>
            <Section label="Content">
              <textarea
                key={t.id}
                defaultValue={t.content}
                onBlur={(e) => setProp({ content: e.target.value } as Partial<Overlay>)}
                rows={3}
                className="w-full resize-none rounded-md border border-ds-subtle bg-surface-canvas px-2.5 py-2 text-[13px] text-ds-primary outline-hidden focus-visible:ring-1 focus-visible:ring-gold/50"
              />
            </Section>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <Mono size="8" className={labelCls}>Size</Mono>
                <input type="number" key={size} defaultValue={size} onBlur={(e) => setStyle({ fontSize: `${Number(e.target.value)}px` })} className={boxCls} />
              </div>
              <div>
                <Mono size="8" className={labelCls}>Weight</Mono>
                <Select size="sm" aria-label="Font weight" value={String(t.styles?.fontWeight ?? '400')} onChange={(v) => setStyle({ fontWeight: v })}
                  options={WEIGHTS.map((w) => ({ value: w, label: w }))} />
              </div>
            </div>
            <Section label="Colour">
              <div className="flex items-center gap-2">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" onClick={() => setStyle({ color: c })}
                    className={cn('h-7 w-7 rounded-md border', color.toLowerCase() === c.toLowerCase() ? 'border-2 border-gold' : 'border-ds-subtle')}
                    style={{ background: c }} aria-label={c} />
                ))}
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#ECE9E1'} onChange={(e) => setStyle({ color: e.target.value })} className="h-7 w-7 cursor-pointer rounded-md border border-ds-subtle bg-transparent" />
              </div>
            </Section>
            <Section label="Align">
              <div className="inline-flex rounded-button border border-ds-subtle bg-surface-deeper p-0.5">
                {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                  <button key={a} type="button" onClick={() => setStyle({ textAlign: a })}
                    className={cn('flex h-7 w-8 items-center justify-center rounded-[5px]', align === a ? 'bg-gold text-[#241B08]' : 'text-ds-muted hover:text-ds-secondary')}>
                    <Icon size={14} />
                  </button>
                ))}
              </div>
            </Section>
            <Section label="Animation">
              <AnimationPills current={t.styles?.animation?.enter} onPick={setAnim} />
            </Section>
          </>
        );
      })()}

      {sel.type === OverlayType.VIDEO && (() => {
        const v = sel as ClipOverlay;
        const volume = v.styles?.volume ?? 1;
        const fit = v.styles?.objectFit ?? 'cover';
        return (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <Mono size="8" className={labelCls}>Speed ×</Mono>
                <input type="number" step={0.1} min={0.25} max={4} key={v.speed ?? 1} defaultValue={v.speed ?? 1} onBlur={(e) => setProp({ speed: Number(e.target.value) } as Partial<Overlay>)} className={boxCls} />
              </div>
              <div>
                <Mono size="8" className={labelCls}>Fit</Mono>
                <Select size="sm" aria-label="Fit" value={fit} onChange={(v) => setStyle({ objectFit: v })}
                  options={FITS.map((f) => ({ value: f, label: f }))} />
              </div>
            </div>
            <Section label="Volume">
              <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setStyle({ volume: Number(e.target.value) })} className="w-full accent-gold" />
            </Section>
            <Section label="Animation">
              <AnimationPills current={v.styles?.animation?.enter} onPick={setAnim} />
            </Section>
          </>
        );
      })()}

      {sel.type === OverlayType.IMAGE && (() => {
        const im = sel as ImageOverlay;
        const fit = im.styles?.objectFit ?? 'cover';
        const radius = parseInt(String(im.styles?.borderRadius ?? '0'), 10) || 0;
        return (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <Mono size="8" className={labelCls}>Fit</Mono>
                <Select size="sm" aria-label="Fit" value={fit} onChange={(v) => setStyle({ objectFit: v })}
                  options={FITS.map((f) => ({ value: f, label: f }))} />
              </div>
              <div>
                <Mono size="8" className={labelCls}>Radius</Mono>
                <input type="number" min={0} key={radius} defaultValue={radius} onBlur={(e) => setStyle({ borderRadius: `${Number(e.target.value)}px` })} className={boxCls} />
              </div>
            </div>
            <Section label="Animation">
              <AnimationPills current={im.styles?.animation?.enter} onPick={setAnim} />
            </Section>
          </>
        );
      })()}

      {sel.type === OverlayType.SOUND && (() => {
        const s = sel as SoundOverlay;
        const volume = s.styles?.volume ?? 1;
        return (
          <Section label="Volume">
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setStyle({ volume: Number(e.target.value) })} className="w-full accent-gold" />
          </Section>
        );
      })()}

      <div className="my-3.5 h-px bg-ds-subtle" />

      {/* Real keyframe inspector — reused as-is (self-collapsing). */}
      <KeyframeInspectorPanel overlay={sel} />

      <span className="flex-1" />

      <button
        type="button"
        onClick={() => { deleteOverlay(sel.id); setSelectedOverlayId(null); }}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-button border border-status-danger/40 py-2 text-[12.5px] font-bold text-status-danger transition-colors hover:bg-status-danger/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-status-danger/50"
      >
        <Trash2 size={14} /> Delete overlay
      </button>
    </div>
  );
}
