"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditsErrorPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onTopup?: () => void;
  required?: number;
  available?: number;
  serviceName?: string;
}

export function CreditsErrorPopup({ 
  isOpen, 
  onClose, 
  onTopup,
  required = 0,
  available = 0,
  serviceName = "this action"
}: CreditsErrorPopupProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-5 pb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Insufficient Credits</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-5 pb-5 space-y-4">
            <p className="text-muted-foreground text-sm">
              You need more credits for {serviceName}.
            </p>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Required</span>
                <span className="font-medium tabular-nums">{required} credits</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available</span>
                <span className="font-medium tabular-nums">{available} credits</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="text-muted-foreground">Need</span>
                <span className="font-medium tabular-nums">
                  {Math.max(0, required - available)} more
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-muted hover:bg-muted/80 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onTopup?.();
                  onClose();
                }}
                className={cn(
                  "flex-1 py-2.5 rounded-lg font-medium text-sm",
                  "bg-foreground text-background",
                  "hover:bg-foreground/90 transition-colors"
                )}
              >
                Add Credits
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
