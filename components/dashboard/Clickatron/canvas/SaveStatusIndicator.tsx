"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, AlertCircle, Loader2, Wifi, WifiOff, Clock } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

interface SaveStatusIndicatorProps {
  isSaving: boolean;
  saveError: string | null;
  lastSaved: Date | null;
}

export function SaveStatusIndicator({
  isSaving,
  saveError,
  lastSaved,
}: SaveStatusIndicatorProps) {
  const networkStatus = useNetworkStatus();
  const getStatusContent = () => {    
    // Priority 1: Network status
    if (!networkStatus.isOnline) {
      return {
        icon: <WifiOff className="h-3 w-3" />,
        text: "Offline",
        className: "bg-orange-500/20 text-orange-300 border-orange-500/30",
      };
    }

    // Priority 3: Current save status
    if (isSaving) {
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        text: "Saving...",
        className: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      };
    }

    if (saveError && !saveError.includes('Queued')) {
      return {
        icon: <AlertCircle className="h-3 w-3" />,
        text: "Unable to save",
        className: "bg-red-500/20 text-red-300 border-red-500/30",
      };
    }

    if (lastSaved) {
      const timeDiff = Date.now() - lastSaved.getTime();
      const secondsAgo = Math.floor(timeDiff / 1000);
      
      let timeText = "All changes saved";
      if (secondsAgo > 5 && secondsAgo < 60) {
        timeText = `Saved ${secondsAgo}s ago`;
      } else if (secondsAgo >= 60) {
        const minutesAgo = Math.floor(secondsAgo / 60);
        timeText = `Saved ${minutesAgo}m ago`;
      }

      return {
        icon: <Check className="h-3 w-3" />,
        text: timeText,
        className: "bg-green-500/20 text-green-300 border-green-500/30",
      };
    }

    // Show a default state when no save has occurred yet
    return {
      icon: <Wifi className="h-3 w-3 opacity-50" />,
      text: "Ready to save",
      className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    };
  };

  const status = getStatusContent();

  return (
    <AnimatePresence mode="wait">
      {status && (
        <motion.div
          key={status.text}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          transition={{ duration: 0.2 }}
          className={`
            inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
            border backdrop-blur-sm ${status.className}
          `}
        >
          {status.icon}
          {status.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}