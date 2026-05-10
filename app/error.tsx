"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import { motion } from "framer-motion";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Log to console and any error monitoring here
    console.error("Unhandled error (GlobalError):", error);
  }, [error]);

  const router = useRouter();

  // No retry button: user can go home to recover. Resets are handled by the app router's boundary when appropriate.

  const isProd = process.env.NODE_ENV === "production";

  return (
    <>
      <CursorEffect variant="glow" color="#3B81F5" size={400} blur={80} opacity={0.12} />
      <div className="min-h-screen bg-[rgb(var(--surface-0))] flex flex-col overflow-hidden">
        <Navbar />
        <motion.main
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-12"
        >
          <div className="max-w-lg w-full flex flex-col items-center gap-6 text-center">
            <svg width="180" height="180" viewBox="0 0 180 180" fill="none" aria-hidden="true">
              <circle cx="90" cy="90" r="90" fill="#F2F6FF" />
              <path d="M60 120 Q90 90 120 120" stroke="#3B81F5" strokeWidth="4" strokeLinecap="round" fill="none"/>
              <ellipse cx="70" cy="80" rx="8" ry="12" fill="#3B81F5" />
              <ellipse cx="110" cy="80" rx="8" ry="12" fill="#3B81F5" />
              <ellipse cx="70" cy="83" rx="3" ry="4" fill="#fff" opacity="0.7"/>
              <ellipse cx="110" cy="83" rx="3" ry="4" fill="#fff" opacity="0.7"/>
            </svg>

            <h1 className="text-[44px] font-bold primtext drop-shadow-sm">
              Something went wrong
            </h1>

            <p className="text-lg text-muted-foreground">
              We encountered an unexpected problem. Try refreshing or come back later.
            </p>

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => router.push('/')}
                className="inline-flex items-center rounded-lg bg-[#3B81F5] text-white font-semibold px-6 py-3 shadow-md hover:bg-[#2851A3] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#3B81F5] focus:ring-offset-2"
              >
                Go home
              </button>
            </div>

            {!isProd && (
              <details className="mt-4 w-full max-w-prose text-left bg-[rgb(var(--surface-1))] p-3 rounded-md border border-neutral-200 dark:border-neutral-800 text-sm text-muted-foreground">
                <summary className="cursor-pointer font-medium">Error details</summary>
                <pre className="whitespace-pre-wrap mt-2 text-[11px]">{String(error?.stack || error?.message)}</pre>
              </details>
            )}
          </div>
        </motion.main>
        <Footer />
      </div>
    </>
  );
}
