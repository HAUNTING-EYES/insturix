"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Coins, AlertCircle, Plus } from "lucide-react";
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
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold">Insufficient Credits</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 pb-6 space-y-4">
            <p className="text-muted-foreground">
              You don't have enough credits for {serviceName}.
            </p>

            <div className="bg-muted/50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Required</span>
                <span className="font-medium text-red-500">{required} credits</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Available</span>
                <span className="font-medium">{available} credits</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="text-sm text-muted-foreground">Need</span>
                <span className="font-medium text-amber-500">
                  {Math.max(0, required - available)} more credits
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
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
                  "flex-1 py-2.5 rounded-lg font-medium text-sm text-white",
                  "bg-gradient-to-r from-amber-500 to-orange-500",
                  "hover:from-amber-600 hover:to-orange-600 transition-all",
                  "flex items-center justify-center gap-2"
                )}
              >
                <Plus className="w-4 h-4" />
                Top-up
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
