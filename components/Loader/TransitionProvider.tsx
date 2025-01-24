"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { LoadingScreen } from "./LoadingScreen";

export function TransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);

  // Handle initial app load
  useEffect(() => {
    const timer = setTimeout(() => setIsInitialLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Handle page transitions
  useEffect(() => {
    if (!isInitialLoading) {
      setIsPageTransitioning(true);
      const timer = setTimeout(() => setIsPageTransitioning(false), 800);
      return () => clearTimeout(timer);
    }
  }, [pathname, isInitialLoading]);

  return (
    <AnimatePresence mode="wait">
      {isInitialLoading || isPageTransitioning ? (
        <LoadingScreen key="loading" />
      ) : (
        <motion.div
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
