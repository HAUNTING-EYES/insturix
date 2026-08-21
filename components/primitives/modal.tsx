'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Mono } from './mono';
import { Btn } from './btn';

/* ═══ Insturix primitives · Modal + Confirm ══════════════════════════
   Centered sheet over a scrim, and a danger-confirm built on it. Fixed
   width steps keep the class static.

   Dialog a11y (2026-08 audit P2.3, fixed once here for every consumer):
   role="dialog" + aria-modal + aria-labelledby, Escape closes, focus moves
   into the sheet on open, Tab is trapped inside, and focus returns to the
   opener on close. Previously Tab walked straight into the page behind the
   scrim and screen readers never heard a dialog. */

const WIDTH = {
  sm: 'max-w-[420px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[660px]',
} as const;

export type ModalWidth = keyof typeof WIDTH;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  sub,
  width = 'md',
  onClose,
  children,
}: {
  title: string;
  sub?: string;
  width?: ModalWidth;
  onClose: () => void;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Move focus into the dialog (the sheet itself, so the first Tab lands on
    // the first control without auto-activating anything).
    sheetRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusables = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === sheet)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[59] bg-black/60" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn('max-h-[92vh] w-full overflow-y-auto rounded-card border border-ds-emphasis bg-surface-raised focus-visible:outline-hidden', WIDTH[width])}>
          <div className="sticky top-0 z-[2] flex items-center justify-between border-b border-ds-subtle bg-surface-raised px-[18px] py-[15px]">
            <div id={titleId}>
              <Mono size="10" className="text-gold">{title}</Mono>
              {sub && <div className="mt-[3px] text-[12px] text-ds-muted">{sub}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-ds-subtle bg-surface-deeper text-ds-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              ✕
            </button>
          </div>
          <div className="p-[18px]">{children}</div>
        </div>
      </div>
    </>
  );
}

export function Confirm({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} width="sm" onClose={onClose}>
      <div className="mb-5 text-[14px] leading-[1.55] text-ds-secondary">{message}</div>
      <div className="flex justify-end gap-2">
        <Btn size="sm" onClick={onClose}>Cancel</Btn>
        <Btn size="sm" variant="danger" onClick={onConfirm}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
}
