// app/not-found.tsx

"use client";

import React from "react";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <CursorEffect variant="glow" color="#3B81F5" size={400} blur={80} opacity={0.12} />
      <div className="min-h-screen bg-[rgb(var(--surface-0))] flex flex-col overflow-hidden">
        <Navbar />
        <motion.main
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-12"
        >
          <div className="max-w-lg w-full flex flex-col items-center gap-6">
            <svg width="180" height="180" viewBox="0 0 180 180" fill="none" aria-hidden="true">
              <circle cx="90" cy="90" r="90" fill="#F2F6FF" />
              <path d="M60 120 Q90 100 120 120" stroke="#3B81F5" strokeWidth="4" strokeLinecap="round" fill="none"/>
              <ellipse cx="70" cy="80" rx="8" ry="12" fill="#3B81F5" />
              <ellipse cx="110" cy="80" rx="8" ry="12" fill="#3B81F5" />
              <ellipse cx="70" cy="83" rx="3" ry="4" fill="#fff" opacity="0.7"/>
              <ellipse cx="110" cy="83" rx="3" ry="4" fill="#fff" opacity="0.7"/>
            </svg>
            <h1 className="text-4xl font-bold text-[rgb(var(--primary-900))] drop-shadow-sm text-center">
              404 – Page Not Found
            </h1>
            <p className="text-lg text-[rgb(var(--primary-700))] text-center">
              Oops! The page you're looking for doesn't exist or has been moved.
            </p>
            <Link
              href="/"
              className="mt-2 inline-block rounded-lg bg-[#3B81F5] text-white font-semibold px-6 py-3 shadow-md hover:bg-[#2851A3] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#3B81F5] focus:ring-offset-2"
            >
              Go back home
            </Link>
          </div>
        </motion.main>
        <Footer />
      </div>
    </>
  );
}
