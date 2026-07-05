'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Mono } from './mono';
import { Btn } from './btn';

/* ═══ Insturix primitives · Modal + Confirm ══════════════════════════
   Centered sheet over a scrim, and a danger-confirm built on it. Fixed
   width steps keep the class static. */

const WIDTH = {
  sm: 'max-w-[420px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[660px]',
} as const;

export type ModalWidth = keyof typeof WIDTH;

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
  return (
    <>
      <div className="fixed inset-0 z-[59] bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
        <div className={cn('max-h-[92vh] w-full overflow-y-auto rounded-card border border-ds-emphasis bg-surface-raised', WIDTH[width])}>
          <div className="sticky top-0 z-[2] flex items-center justify-between border-b border-ds-subtle bg-surface-raised px-[18px] py-[15px]">
            <div>
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
