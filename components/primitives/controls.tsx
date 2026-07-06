'use client';

import { cn } from '@/lib/utils';
import { Mono } from './mono';

/* ═══ Insturix primitives · Seg / Toggle / Drop ══════════════════════
   Segmented toggle, on/off switch, and upload drop-zone. Gold = selected/
   on/filled. All keyboard-focusable with the gold focus ring. */

export function Seg<T extends string>({
  opts,
  value,
  onChange,
  disabled,
  className,
}: {
  opts: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex flex-wrap rounded-button border border-ds-subtle bg-surface-canvas p-[3px]', className)}>
      {opts.map(([k, label]) => {
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onChange(k)}
            className={cn(
              'rounded-[5px] px-3 py-[7px] font-mono text-[10px] uppercase tracking-[0.05em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60',
              active ? 'bg-gold font-bold text-[#241B08]' : 'text-ds-muted hover:text-ds-secondary',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60',
        on ? 'border-gold bg-gold/20' : 'border-ds-subtle bg-surface-canvas',
      )}
    >
      <span
        className={cn('absolute top-[2px] h-4 w-4 rounded-full transition-[left] duration-200 ease-out-expo', on ? 'left-[18px] bg-gold' : 'left-[2px] bg-ds-dim')}
      />
    </button>
  );
}

export function Drop({
  label,
  big,
  filled,
  busy,
  onClick,
}: {
  label: string;
  big?: boolean;
  filled?: boolean;
  busy?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60',
        big ? 'h-[180px]' : 'h-[92px]',
        filled ? 'border-gold bg-gold/5 text-gold' : 'border-ds-emphasis bg-surface-canvas text-ds-muted hover:border-ds-subtle',
        busy && 'cursor-wait',
      )}
    >
      <span className={cn(big ? 'text-[26px]' : 'text-[18px]')}>{busy ? '…' : filled ? '✓' : '↥'}</span>
      <Mono size="9" className={filled ? 'text-gold' : 'text-ds-muted'}>{busy ? 'Uploading' : filled ? 'Uploaded' : label}</Mono>
    </button>
  );
}
