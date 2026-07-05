import type { ReactNode } from 'react';
import { Mono } from './mono';

/* ═══ Insturix primitives · Field + input tokens ═════════════════════
   Labelled form row + the shared input/textarea class strings so every
   surface uses one input treatment (warm-dark canvas, gold focus ring). */

export const inputClass =
  'w-full rounded-button border border-ds-subtle bg-surface-canvas px-3 py-2.5 text-[13.5px] text-ds-primary outline-none font-sans placeholder:text-ds-dim focus-visible:ring-2 focus-visible:ring-gold/50';

export const textareaClass = `${inputClass} resize-y`;

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <Mono size="9">{label}</Mono>
        {hint && <Mono size="8" className="text-ds-faint">{hint}</Mono>}
      </div>
      {children}
    </label>
  );
}
