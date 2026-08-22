"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UploadProgressProps {
  uploadState: {
    progress: number;
  } | null;
  onCancel: () => void;
}

export function UploadProgress({ uploadState, onCancel }: UploadProgressProps) {
  if (!uploadState) return null;

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2, delay: 0.1 }}
      className="w-full p-4"
    >
      <div className="space-y-4">
        {/* Progress bar */}
        <div className="h-2 bg-black/60 rounded-full overflow-hidden">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: uploadState.progress }}
            transition={{ duration: 0.3 }}
            className="h-full w-full origin-left bg-gradient-to-r from-zinc-200 to-white"
          />
        </div>

        {/* Status */}
        <div className="flex items-center justify-between text-sm text-zinc-300">
          <div className="space-y-1">
            <div className="font-medium">Uploading...</div>
            <div className="text-zinc-400">{Math.round(uploadState.progress * 100)}%</div>
          </div>

          {/* Cancel button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-zinc-400 hover:text-zinc-300"
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
    </motion.div>
  );
}