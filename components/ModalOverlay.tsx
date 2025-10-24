"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { ReactNode, useEffect, useRef } from "react";

export default function ModalOverlay({
  open,
  onClose,
  children,
  title,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  icon?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Basic focus trap within the modal and body scroll lock
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const container = panelRef.current;
    if (!container) return () => {
      document.body.style.overflow = previousOverflow;
    };

    // Focus the first focusable element or the close button by default
    const focusable = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || focusable.length === 0) return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTab);
    return () => {
      document.removeEventListener("keydown", handleTab);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[100]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <div className="absolute inset-0 grid place-items-center p-4">
            <motion.div
              role="dialog"
              aria-modal={true}
              aria-labelledby="modal-title"
              ref={panelRef}
              className="relative w-full max-w-3xl overflow-hidden rounded-2xl text-white backdrop-blur-xl"
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 160, damping: 20 }}
            >
              {/* Outer subtle frame */}
              <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-white/10 via-white/5 to-white/10">
                {/* Inner panel */}
                <div className="relative rounded-[15px] bg-zinc-950/85 border border-white/10">
                  {/* Diagonal sheen */}
                  <div className="pointer-events-none absolute inset-0 opacity-15" aria-hidden>
                    <div className="absolute -left-1/2 top-0 h-full w-[200%] rotate-12 bg-gradient-to-b from-transparent via-white/5 to-transparent" />
                  </div>
                  {/* Subtle noise texture */}
                  <div className="pointer-events-none absolute inset-0 noise-texture" aria-hidden />

                  {/* Header */}
                  <div className="relative flex items-center justify-between gap-6 border-b border-white/10 px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      {icon ? (
                        <div className="grid size-8 place-items-center rounded-lg border border-white/10 text-white">
                          {icon}
                        </div>
                      ) : null}
                      <div id="modal-title" className="text-base font-semibold tracking-wide text-white">
                        {title ?? "Details"}
                      </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30" aria-label="Close dialog">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="max-h-[72vh] overflow-y-auto px-6 py-5 text-[15px] leading-relaxed text-zinc-200 [mask-image:linear-gradient(#000,rgba(0,0,0,0.92)_96%,transparent)]">
                    <div className="space-y-4">{children}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
