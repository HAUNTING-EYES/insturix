'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ═══ Insturix primitives · Select ════════════════════════════════════
   Token-styled replacement for the native <select>, whose OS option list
   renders white and breaks the dark theme (the audit found native selects
   in 35 files). Promoted from the SaaS-explainer studio's Dropdown and
   upgraded to a full listbox:

   - trigger: aria-haspopup/aria-expanded, gold focus ring
   - panel:   role="listbox" + aria-activedescendant
   - options: role="option" + aria-selected, active option kept in view
   - keys:    ArrowUp/Down · Home/End · Enter/Space select · Esc closes
              (focus returns to the trigger) · Tab closes
   - mouse:   outside-click closes

   API is a drop-in superset of the studio Dropdown so swaps are mechanical. */

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  className,
  panelClassName,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  panelClassName?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value);
  const enabledIndexes = options
    .map((o, i) => (o.disabled ? -1 : i))
    .filter((i) => i >= 0);

  const openList = useCallback(() => {
    if (disabled) return;
    const selIdx = options.findIndex((o) => o.value === value && !o.disabled);
    setActiveIndex(selIdx >= 0 ? selIdx : enabledIndexes[0] ?? -1);
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, options, value]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (index: number) => {
      const opt = options[index];
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      close();
    },
    [options, onChange, close],
  );

  // Outside-click closes without stealing focus back.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const move = (delta: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const pos = enabledIndexes.indexOf(activeIndex);
    const next =
      pos === -1
        ? enabledIndexes[0]
        : enabledIndexes[Math.min(enabledIndexes.length - 1, Math.max(0, pos + delta))];
    setActiveIndex(next);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'Home': e.preventDefault(); setActiveIndex(enabledIndexes[0] ?? -1); break;
      case 'End': e.preventDefault(); setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? -1); break;
      case 'Enter':
      case ' ': e.preventDefault(); commit(activeIndex); break;
      case 'Escape': e.preventDefault(); close(); break;
      case 'Tab': close(false); break;
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openList())}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-md border bg-surface-well px-3.5 text-left text-[14px] transition-colors',
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          open ? 'border-gold' : 'border-ds-subtle hover:border-ds-emphasis',
        )}
      >
        <span className={cn('truncate', selected ? 'text-ds-primary' : 'text-ds-dim')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={15}
          aria-hidden
          className={cn('shrink-0 transition-transform', open ? 'rotate-180 text-gold' : 'text-ds-muted')}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          className={cn(
            'absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-64 overflow-y-auto rounded-lg border border-ds-emphasis bg-surface-raised p-1 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.75)]',
            panelClassName,
          )}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            const isActive = i === activeIndex;
            return (
              <div
                key={o.value}
                id={`${listboxId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                onMouseEnter={() => !o.disabled && setActiveIndex(i)}
                onMouseDown={(e) => e.preventDefault() /* keep trigger focus */}
                onClick={() => commit(i)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left transition-colors',
                  o.disabled && 'cursor-not-allowed opacity-40',
                  isSelected ? 'bg-gold/10 text-gold' : 'text-ds-secondary',
                  isActive && !isSelected && 'bg-surface-well text-ds-primary',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{o.label}</span>
                  {o.sublabel && (
                    <span className="mt-0.5 block truncate text-[11px] text-ds-faint">{o.sublabel}</span>
                  )}
                </span>
                {isSelected && <Check size={14} aria-hidden className="shrink-0 text-gold" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
