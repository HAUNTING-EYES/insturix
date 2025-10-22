"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Calendar, ArrowRight } from 'lucide-react';
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

  const handleLearnMore = () => {
    router.push('/ics25/register');
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
          className="fixed top-16 left-0 right-0 z-40 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/90 dark:to-purple-950/90 border-b border-blue-200 dark:border-blue-800/50 backdrop-blur-xl"
        >
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/60 dark:bg-zinc-800/60 backdrop-blur-sm border border-blue-200 dark:border-blue-700">
                  <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">22 Nov 2025 • IIIT Delhi</span>
                </div>
                <div className="hidden sm:block">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mr-2">ICS'25 - Gaming Tournament (Sub-Event)</span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Register your team for Valorant or BGMI</span>
                </div>
                <div className="block sm:hidden">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">ICS'25 Summit</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleLearnMore}
                  size="sm"
                  className="bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg px-4 py-1.5 text-sm font-medium"
                >
                  <span className="hidden sm:inline">Register for Gaming</span>
                  <span className="sm:hidden">Register</span>
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
                
                <button
                  onClick={handleDismiss}
                  className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors duration-200"
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