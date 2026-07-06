'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Mono } from './mono';

/* ═══ Insturix primitives · timeline Track + Clip ════════════════════
   A timeline lane (label gutter + track area) and a positioned clip block.
   NOTE: a clip's left/width are DATA (percent-of-timeline), not design
   tokens — those come through `style`; every colour/border/radius is a
   token class. Tone expresses the clip's kind by form, gold = accent. */

const GUTTER = 54;

export function Track({ label, children, last }: { label: string; children?: ReactNode; last?: boolean }) {
  return (
    <div className={cn('flex h-11', !last && 'border-b border-ds-subtle')}>
      <div className="flex shrink-0 items-center justify-center border-r border-ds-subtle" style={{ width: GUTTER }}>
        <Mono size="7" className="text-ds-dim">{label}</Mono>
      </div>
      <div className="relative flex-1 px-0.5">{children}</div>
    </div>
  );
}

const TONE = {
  default: 'bg-[var(--border-emphasis)] border-ds-faint text-ds-muted',
  gold: 'bg-gold/[0.12] border-gold/40 text-gold',
  muted: 'bg-surface-well border-ds-emphasis text-ds-muted',
  danger: 'bg-status-danger/10 border-status-danger/40 text-status-danger',
  green: 'bg-status-success/10 border-status-success/35 text-status-success',
} as const;

export type ClipTone = keyof typeof TONE;

export function Clip({
  leftPct,
  widthPct,
  tone = 'default',
  className,
  style,
  onClick,
  draggable,
  onDragStart,
  children,
}: {
  leftPct: number;
  widthPct: number;
  tone?: ClipTone;
  className?: string;
  style?: CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  children?: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      style={{ left: `${leftPct}%`, width: `${widthPct}%`, ...style }}
      className={cn(
        'absolute inset-y-1 flex items-center gap-1 overflow-hidden rounded-[3px] border pl-1.5',
        TONE[tone],
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}
