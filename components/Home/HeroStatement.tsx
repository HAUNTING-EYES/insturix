"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Play, RotateCw } from "lucide-react";
import { ScannerDivider } from "@/components/ui/ScannerDivider";

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

export default function HeroStatement() {
  return (
    <section className="relative w-full bg-zinc-950 overflow-hidden">
      
      {/* Subtle radial gradient for depth — no noise, no blur */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-gradient-radial from-zinc-900/80 to-transparent rounded-full opacity-50" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 pt-36 pb-24 relative z-10">
        
        <div className="max-w-4xl mx-auto text-center">
          {/* Eyebrow */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="text-zinc-500 font-semibold text-sm tracking-[0.15em] uppercase mb-6"
          >
            The all-in-one platform for creators
          </motion.p>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease }}
            className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-zinc-50 leading-[1.1] mb-6"
          >
            Your entire content operation.{" "}
            <span className="text-zinc-500">One platform.</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease }}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Edit videos, generate thumbnails, analyze performance, write scripts, compose music, and distribute everywhere — all powered by AI that learns your brand.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/signup">
              <button className="px-8 py-3.5 bg-white hover:bg-zinc-100 text-zinc-950 font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-lg">
                Start Building Free
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <Link href="#suite">
              <button className="px-7 py-3.5 border border-zinc-800 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 font-medium rounded-lg transition-colors flex items-center gap-2">
                <Play className="w-4 h-4 fill-zinc-400 text-zinc-400" />
                See how it works
              </button>
            </Link>
          </motion.div>
        </div>

        {/* Dashboard Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.5, ease }}
          className="mt-20 max-w-6xl mx-auto relative"
        >
          <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-2xl overflow-hidden">
            {/* Browser chrome */}
            <div className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                <div className="w-3 h-3 rounded-full bg-zinc-700" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="h-6 w-64 bg-zinc-800 rounded-md flex items-center justify-center">
                  <span className="text-[11px] text-zinc-500 font-mono">www.insturix.com/dashboard</span>
                </div>
              </div>
            </div>

            {/* App body */}
            <div className="flex h-[380px] md:h-[500px]">
              {/* Sidebar */}
              <div className="hidden md:flex flex-col w-56 border-r border-zinc-800 bg-zinc-950/50 p-3 gap-1">
                <div className="h-10 rounded-md bg-zinc-800/50 mb-3 flex items-center px-3 border border-zinc-700/50">
                  <div className="w-6 h-6 rounded bg-zinc-700 mr-2" />
                  <div className="w-20 h-3 bg-zinc-700 rounded" />
                </div>
                {["Editron", "Clickatron", "Alyzitron", "ThinkForge", "Musitron"].map((name, i) => (
                  <div key={name} className={`h-9 rounded-md flex items-center px-3 gap-2 text-sm ${i === 0 ? "bg-zinc-800 text-zinc-200" : "text-zinc-500"}`}>
                    <div className={`w-2 h-2 rounded-full ${
                      i === 0 ? "bg-emerald-400" : 
                      i === 1 ? "bg-indigo-400" : 
                      i === 2 ? "bg-blue-400" : 
                      i === 3 ? "bg-red-400" : "bg-amber-400"
                    }`} />
                    <span className="font-medium">{name}</span>
                  </div>
                ))}
                <div className="mt-auto border-t border-zinc-800 pt-3">
                  <div className="h-9 rounded-md flex items-center px-3 gap-2 text-sm text-zinc-500">
                    <div className="w-6 h-6 rounded-full bg-zinc-800" />
                    <div className="w-16 h-3 bg-zinc-800 rounded" />
                  </div>
                </div>
              </div>

              {/* Main content area */}
              <div className="flex-1 p-4 md:p-6 flex flex-col gap-4 relative overflow-hidden">
                {/* Top bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-28 h-5 bg-zinc-800 rounded" />
                    <div className="w-16 h-5 bg-zinc-800/50 rounded" />
                  </div>
                  <div className="flex gap-2">
                    <div className="w-20 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-md flex items-center justify-center">
                      <span className="text-[11px] text-emerald-400 font-medium">Export</span>
                    </div>
                    <div className="w-8 h-8 bg-zinc-800 rounded-md" />
                  </div>
                </div>

                {/* Video preview area */}
                <div className="flex-1 bg-zinc-950 rounded-lg border border-zinc-800 relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-zinc-950" />
                  <div className="relative flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                      <Play className="w-5 h-5 text-zinc-400 fill-zinc-400 ml-0.5" />
                    </div>
                    <span className="text-xs text-zinc-600 font-medium">Preview</span>
                  </div>
                  <div className="absolute top-3 left-3 flex gap-2">
                    <div className="h-6 px-2 bg-zinc-800/80 rounded text-[10px] text-zinc-400 flex items-center">1920×1080</div>
                    <div className="h-6 px-2 bg-zinc-800/80 rounded text-[10px] text-zinc-400 flex items-center">00:12:34</div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="h-20 md:h-28 bg-zinc-950 rounded-lg border border-zinc-800 p-3 flex flex-col gap-1.5">
                  <div className="flex gap-1.5 flex-1 relative">
                    <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30 z-10" />
                    <div className="w-14 shrink-0 text-[10px] text-zinc-600 flex items-center">Video</div>
                    <div className="flex-1 flex gap-1">
                      <div className="flex-[3] bg-emerald-500/15 border border-emerald-500/30 rounded h-full" />
                      <div className="flex-[2] bg-emerald-500/10 border border-emerald-500/15 rounded h-full" />
                      <div className="flex-[1] bg-emerald-500/15 border border-emerald-500/20 rounded h-full" />
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-1">
                    <div className="w-14 shrink-0 text-[10px] text-zinc-600 flex items-center">Audio</div>
                    <div className="flex-1 flex gap-1">
                      <div className="flex-1 bg-indigo-500/15 border border-indigo-500/30 rounded h-full" />
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-1">
                    <div className="w-14 shrink-0 text-[10px] text-zinc-600 flex items-center">Captions</div>
                    <div className="flex-1 flex gap-1">
                      <div className="flex-[2] bg-blue-500/10 border border-blue-500/15 rounded h-full" />
                      <div className="flex-[3] bg-blue-500/10 border border-blue-500/15 rounded h-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right panel */}
              <div className="hidden lg:flex flex-col w-60 border-l border-zinc-800 bg-zinc-950/50 p-4 gap-4">
                <div className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">AI Actions</div>
                {["Remove filler words", "Auto-cut silences", "Add captions", "Match brand pacing"].map((action) => (
                  <div key={action} className="h-10 rounded-md bg-zinc-800/30 border border-zinc-800 flex items-center px-3 text-xs text-zinc-400">
                    {action}
                  </div>
                ))}
                <div className="mt-auto">
                  <div className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-2">Brand Vault</div>
                  <div className="h-20 rounded-md bg-zinc-800/20 border border-zinc-800 border-dashed flex items-center justify-center text-xs text-zinc-600">
                    Connected
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none" />
        </motion.div>

      </div>

      {/* Section divider */}
      <ScannerDivider />
    </section>
  );
}
