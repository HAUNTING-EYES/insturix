import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* ═══ Insturix primitives · Mono ══════════════════════════════════════
   Uppercase JetBrains-Mono micro-label. The shared design vocabulary for
   type/stage/section labels. Color via className (default ds-muted);
   size is a fixed step so the class is static (Tailwind-purge safe). */

const SIZE = {
  '7': 'text-[7px]',
  '8': 'text-[8px]',
  '9': 'text-[9px]',
  '10': 'text-[10px]',
  '11': 'text-[11px]',
  '12': 'text-[12px]',
} as const;

export type MonoSize = keyof typeof SIZE;

export function Mono({
  size = '9',
  className,
  children,
}: {
  size?: MonoSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('font-mono uppercase tracking-[0.12em] text-ds-muted', SIZE[size], className)}>
      {children}
    </span>
  );
}
