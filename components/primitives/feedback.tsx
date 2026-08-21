'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Mono } from './mono';
import { Btn } from './btn';

/* ═══ Insturix primitives · feedback states ═══════════════════════════
   The audit found 252 spinner usages vs 6 skeleton mentions, empty states
   without next actions, and errors rendered as happy empty states. These
   three primitives are the shared vocabulary for the async-state pass:

   - Skeleton:   layout-preserving loading block (no spinner-or-nothing)
   - EmptyState: "nothing here yet" WITH the next action
   - ErrorState: failure + retry — an error must never render as empty  */

/** Pulsing placeholder block. Size it with className (h-*, w-*). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-surface-well', className)}
    />
  );
}

/** First-run / no-data state. Always offer the next action when one exists. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-ds-emphasis bg-surface-raised px-6 py-10 text-center',
        className,
      )}
    >
      {icon && <span className="text-ds-dim">{icon}</span>}
      <div>
        <p className="text-[14px] font-semibold text-ds-primary">{title}</p>
        {description && <p className="mt-1 max-w-[46ch] text-[12.5px] leading-relaxed text-ds-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Failure state with retry. role="alert" so screen readers announce it. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Retry',
  compact,
  className,
}: {
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  /** Slim inline banner instead of a block (for banners above content). */
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <div
        role="alert"
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-md border border-status-danger/40 bg-status-danger/10 px-3.5 py-2.5',
          className,
        )}
      >
        <p className="min-w-0 text-[13px] text-status-danger">
          <span className="font-semibold">{title}.</span>{' '}
          {message && <span className="text-ds-secondary">{message}</span>}
        </p>
        {onRetry && <Btn variant="ghost" size="sm" onClick={onRetry}>{retryLabel}</Btn>}
      </div>
    );
  }
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-status-danger/40 bg-status-danger/[0.06] px-6 py-10 text-center',
        className,
      )}
    >
      <div>
        <Mono size="9" className="text-status-danger">{title}</Mono>
        {message && <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-ds-secondary">{message}</p>}
      </div>
      {onRetry && <Btn variant="ghost" size="sm" onClick={onRetry}>{retryLabel}</Btn>}
    </div>
  );
}
