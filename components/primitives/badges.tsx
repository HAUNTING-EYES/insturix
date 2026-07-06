import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Mono } from './mono';

/* ═══ Insturix primitives · Glyph / Chip / StatusMark ════════════════
   Type + stage are expressed by FORM (a mono 2-letter glyph, a tick's
   weight/shape) — never by a rainbow of colours. Gold marks "active". */

/** Mono 2-letter type/platform badge (e.g. IG, Vd, Mg). */
export function Glyph({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span className={cn('shrink-0 font-mono text-[8.5px] font-bold tracking-[0.04em]', active ? 'text-gold' : 'text-ds-muted')}>
      {children}
    </span>
  );
}

/** Small rounded tag. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-[20px] border border-ds-subtle bg-surface-deeper px-2 py-[3px]', className)}>
      <Mono size="8" className="text-ds-secondary">{children}</Mono>
    </span>
  );
}

export type StatusKind = 'done' | 'review' | 'attention' | 'none';

/** Stage-by-form dot: filled gold = done/approved, gold ring = in review,
    coral ring = needs attention. No fill for neutral. */
export function StatusMark({ kind }: { kind: StatusKind }) {
  if (kind === 'done') return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />;
  if (kind === 'review') return <span className="h-1.5 w-1.5 shrink-0 rounded-full border-[1.5px] border-gold" />;
  if (kind === 'attention') return <span className="h-1.5 w-1.5 shrink-0 rounded-full border-[1.5px] border-status-danger" />;
  return null;
}
