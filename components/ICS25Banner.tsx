"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Flame, ArrowRight, Ticket } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ICS25Banner() {
  const [showBanner, setShowBanner] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Always show banner on each page load. If you still want to gate it
    // behind the popup being seen first, uncomment the hasSeenPopup logic below.
    try {
      // const hasSeenPopup = localStorage.getItem('ics25-popup-seen');
      // if (hasSeenPopup) {
      //   setShowBanner(true);
      // } else {
      //   setShowBanner(true); // fallback: show anyway
      // }
      setShowBanner(true);
    } catch {
      setShowBanner(true);
    }
  }, []);

  const handleDismiss = () => {
    // Only hide for the current visit; don't persist dismissal so it reappears after reload
    setIsVisible(false);
    setTimeout(() => setShowBanner(false), 300);
  };

  const handleRegisterPass = () => {
    router.push('/checkout');
  };

  const handleLearnMore = () => {
    router.push('/ics25');
  };

  if (!showBanner) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -100 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
            className="fixed top-16 left-0 right-0 z-40 bg-gradient-to-r from-slate-50 via-gray-50 to-zinc-50 dark:from-zinc-900/95 dark:via-zinc-900/95 dark:to-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 backdrop-blur-xl"
        >
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-white/80 to-white/60 dark:from-zinc-900/80 dark:to-zinc-900/60 backdrop-blur-md border border-white/40 dark:border-zinc-700/40 shadow-lg">
                  <Flame className="w-5 h-5 text-orange-500 dark:text-orange-400" />
                  <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">Filling Fast</span>
                </div>

                <div className="hidden sm:block flex-1">
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">ICS'25 Summit Registration Now Open</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 ml-1">Premium passes for creators, founders & innovators</span>
                </div>
                <div className="block sm:hidden">
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">ICS'25 Registration</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  onClick={handleRegisterPass}
                  size="sm"
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg px-4 py-2 text-sm font-bold shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
                >
                  <Ticket className="w-4 h-4" />
                  <span className="hidden sm:inline">Get Passes</span>
                  <span className="sm:hidden">Passes</span>
                  <ArrowRight className="w-3 h-3" />
                </Button>

                <Button
                  onClick={handleLearnMore}
                  size="sm"
                  variant="outline"
                  className="hidden sm:flex border-zinc-300 dark:border-zinc-600 bg-white/50 dark:bg-zinc-900/50 hover:bg-white/70 dark:hover:bg-zinc-900/70 text-zinc-900 dark:text-zinc-100 rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Learn More
                </Button>
                
                <button
                  onClick={handleDismiss}
                  className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors duration-200 ml-1"
                  aria-label="Dismiss banner"
                >
                  <X className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}