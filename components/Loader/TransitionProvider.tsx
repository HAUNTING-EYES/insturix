"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { LoadingScreen } from "./LoadingScreen";

export function TransitionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [prevPathname, setPrevPathname] = useState("");

  // Handle initial app load
  useEffect(() => {
    if (document.readyState === 'complete') {
      setIsInitialLoading(false);
    } else {
      window.addEventListener('load', () => setIsInitialLoading(false));
      return () => window.removeEventListener('load', () => setIsInitialLoading(false));
    }
  }, []);

  // Setup navigation event listeners
  useEffect(() => {
    // For Next.js App Router
    if (prevPathname !== pathname && prevPathname !== '') {
      setIsPageLoading(true);
      // Double requestAnimationFrame technique
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsPageLoading(false);
        });
      });
    }
    
    setPrevPathname(pathname);
  }, [pathname, prevPathname]);

  return (
    <AnimatePresence mode="sync">
      {isInitialLoading || isPageLoading ? (
        <LoadingScreen key="loading" />
      ) : (
        <div key={pathname}>
          {children}
        </div>
      )}
    </AnimatePresence>
  );
}